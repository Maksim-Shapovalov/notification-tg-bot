import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import type { GoogleAuth, JWTInput } from 'google-auth-library';
import { google } from 'googleapis';
import { User } from 'src/entity/user.entity';
import { Repository } from 'typeorm';
import {
  isRuDateTomorrowOrDayAfterTomorrow,
  mapSheetValuesToClientRows,
  type ClientSheetRow,
} from './sheet-client-row.mapper';
import { InjectBot } from 'nestjs-telegraf';
import { Context, Telegraf } from 'telegraf';

export type { ClientSheetRow };

/** Scopes: Sheets (данные таблиц) и Drive (поиск файлов при необходимости). */
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
] as const;

/** ID таблицы по умолчанию (перекрывается GOOGLE_SHEETS_SPREADSHEET_ID в .env). */
const GOOGLE_SHEETS_DEFAULT_SPREADSHEET_ID =
  '1DCGNlvJU2lGcTJpgaBdOHFk0hOJuUZBB0wWwVej-fDI';

const GOOGLE_SA_ENV_KEYS = [
  'GOOGLE_SA_TYPE',
  'GOOGLE_SA_PROJECT_ID',
  'GOOGLE_SA_PRIVATE_KEY_ID',
  'GOOGLE_SA_PRIVATE_KEY',
  'GOOGLE_SA_CLIENT_EMAIL',
  'GOOGLE_SA_CLIENT_ID',
  'GOOGLE_SA_AUTH_URI',
  'GOOGLE_SA_TOKEN_URI',
  'GOOGLE_SA_AUTH_PROVIDER_X509_CERT_URL',
  'GOOGLE_SA_CLIENT_X509_CERT_URL',
  'GOOGLE_SA_UNIVERSE_DOMAIN',
] as const;

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService,
    @InjectBot() private readonly bot: Telegraf<Context>,
  ) {}

  private splitEnvCredentials(): JWTInput | null {
    const get = (key: string) => this.configService.get<string>(key)?.trim();

    const client_email = get('GOOGLE_SA_CLIENT_EMAIL');
    const private_key_raw = this.configService.get<string>(
      'GOOGLE_SA_PRIVATE_KEY',
    );
    const project_id = get('GOOGLE_SA_PROJECT_ID');
    const private_key_id = get('GOOGLE_SA_PRIVATE_KEY_ID');
    const client_id = get('GOOGLE_SA_CLIENT_ID');

    const anySaVar = GOOGLE_SA_ENV_KEYS.some((key) => get(key));
    const allCore =
      client_email &&
      private_key_raw?.trim() &&
      project_id &&
      private_key_id &&
      client_id;

    if (anySaVar && !allCore) {
      throw new Error(
        'Заполните все обязательные GOOGLE_SA_* (email, ключ, project_id, private_key_id, client_id) или уберите префикс GOOGLE_SA_ полностью.',
      );
    }

    if (!allCore) {
      return null;
    }

    const private_key = private_key_raw!.replace(/\\n/g, '\n');

    return {
      type: get('GOOGLE_SA_TYPE') || 'service_account',
      project_id,
      private_key_id,
      private_key,
      client_email,
      client_id,
      auth_uri:
        get('GOOGLE_SA_AUTH_URI') ||
        'https://accounts.google.com/o/oauth2/auth',
      token_uri:
        get('GOOGLE_SA_TOKEN_URI') || 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url:
        get('GOOGLE_SA_AUTH_PROVIDER_X509_CERT_URL') ||
        'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: get('GOOGLE_SA_CLIENT_X509_CERT_URL'),
      universe_domain: get('GOOGLE_SA_UNIVERSE_DOMAIN') || 'googleapis.com',
    } as JWTInput;
  }

  private buildGoogleAuth(): GoogleAuth {
    const split = this.splitEnvCredentials();
    if (split) {
      return new google.auth.GoogleAuth({
        credentials: split,
        scopes: [...GOOGLE_SCOPES],
      });
    }

    const jsonRaw = this.configService.get<string>(
      'GOOGLE_SERVICE_ACCOUNT_JSON',
    );
    const keyFile = this.configService.get<string>(
      'GOOGLE_SERVICE_ACCOUNT_KEY',
    );

    if (jsonRaw?.trim()) {
      try {
        const credentials = JSON.parse(jsonRaw) as Record<string, unknown>;
        return new google.auth.GoogleAuth({
          credentials,
          scopes: [...GOOGLE_SCOPES],
        });
      } catch {
        throw new Error(
          'GOOGLE_SERVICE_ACCOUNT_JSON: невалидный JSON. Для файла на диске используйте GOOGLE_SERVICE_ACCOUNT_KEY.',
        );
      }
    }

    return new google.auth.GoogleAuth({
      keyFile: keyFile || undefined,
      scopes: [...GOOGLE_SCOPES],
    });
  }

  async readSpreadsheetRange(
    spreadsheetId: string,
    rangeA1: string,
  ): Promise<string[][] | null> {
    const auth = this.buildGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: rangeA1,
    });

    const values = res.data.values;
    if (!values?.length) {
      return null;
    }
    return values as string[][];
  }

  spreadsheetIdFromUrl(url: string): string | null {
    const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return m?.[1] ?? null;
  }

  async findSpreadsheetIdByName(
    fileName: string,
    options?: { folderId?: string },
  ): Promise<string | null> {
    const auth = this.buildGoogleAuth();
    const drive = google.drive({ version: 'v3', auth });
    const safeName = fileName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    let q = `mimeType='application/vnd.google-apps.spreadsheet' and name='${safeName}' and trashed=false`;
    if (options?.folderId) {
      q = `'${options.folderId}' in parents and ${q}`;
    }
    const res = await drive.files.list({
      q,
      fields: 'files(id, name)',
      pageSize: 5,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    const files = res.data.files;
    if (!files?.length) {
      return null;
    }
    if (files.length > 1) {
      this.logger.warn(
        `На Диске несколько таблиц с именем "${fileName}", используется первая`,
      );
    }
    return files[0].id ?? null;
  }

  async readConfiguredSpreadsheet(): Promise<string[][] | null> {
    const id =
      this.configService.get<string>('GOOGLE_SHEETS_SPREADSHEET_ID')?.trim() ||
      GOOGLE_SHEETS_DEFAULT_SPREADSHEET_ID;
    const range =
      this.configService.get<string>('GOOGLE_SHEETS_RANGE')?.trim() || 'A:F';
    return this.readSpreadsheetRange(id, range);
  }

  async readConfiguredClientRows(options?: {
    skipHeaderRow?: boolean;
  }): Promise<ClientSheetRow[]> {
    const values = await this.readConfiguredSpreadsheet();
    if (!values?.length) {
      return [];
    }
    return mapSheetValuesToClientRows(values, options);
  }

  async getUserOrCreate(domainId: number) {
    const user = await this.userRepository.findOne({ where: { id: 1 } });
    if (!user) {
      return this.userRepository.save({ id: 1, domainId });
    }
    return user;
  }

  async changeUserActiveStatus(
    domainId: number,
    isActive: boolean,
  ): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: 1 } });

    if (!user) {
      return this.userRepository.save({ id: 1, domainId, isActive });
    }
    return this.userRepository.save({ ...user, isActive });
  }

  private async sendNotifications(rows: ClientSheetRow[]) {
    const user = await this.userRepository.findOne({ where: { id: 1 } });
    if (!user) {
      return;
    }
    if (!user.isActive) {
      return;
    }
    await this.bot.telegram.sendMessage(
      user.domainId,
      rows
        .map(
          (row) => `
🌸 - <b>Клиент:</b> ${row.клиент}
🎯 - <b>Источник:</b> ${row.источник}
📅 - <b>Дата:</b> ${row.дата}
👤 - <b>Ник:</b> ${row.ник}
💆‍♀️ - <b>Услуга:</b> ${row.услуга}
💰 - <b>Стоимость:</b> ${row.стоимость}
    `,
        )
        .join('\n'),
      {
        parse_mode: 'HTML',
      },
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_NOON)
  async handleCron() {
    try {
      this.logger.log('Starting sheet cron');
      const rows = await this.readConfiguredClientRows({
        skipHeaderRow: true,
      });
      const clearRows = rows.filter((row) =>
        isRuDateTomorrowOrDayAfterTomorrow(row.дата),
      );
      this.logger.log(`Found ${clearRows.length} rows to notify`);
      if (clearRows.length > 0) {
        await this.sendNotifications(clearRows);
      }
    } catch (err) {
      this.logger.warn(
        err instanceof Error ? err.message : 'Sheet cron read failed',
      );
    }
  }
}
