/**
 * Строка таблицы: A — клиент, B — источник, C — дата, D — ссылка/ник, E — услуга, F — стоимость.
 */
export type ClientSheetRow = {
  клиент: string;
  источник: string;
  дата: string;
  ник: string;
  услуга: string;
  стоимость: string;
};

const COLUMN_COUNT = 6;

function padRow(row: string[], len: number): string[] {
  const out = row.slice(0, len);
  while (out.length < len) {
    out.push('');
  }
  return out;
}

function cellAt(row: string[], i: number): string {
  return (row[i] ?? '').trim();
}

/**
 * Парсит дату вида ДД.ММ.ГГГГ (как в таблице). Неподходящая строка — null.
 */
export function parseRuDateDdMmYyyy(value: string): Date | null {
  const m = value.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) {
    return null;
  }
  const day = Number(m[1]);
  const month = Number(m[2]) - 1;
  const year = Number(m[3]);
  const d = new Date(year, month, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d;
}

function startOfToday(): Date {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addCalendarDays(base: Date, days: number): Date {
  const x = new Date(base);
  x.setDate(x.getDate() + days);
  return x;
}

/** Дата (календарная) не раньше сегодняшнего дня (локальное время). */
export function isRuDateOnOrAfterToday(value: string): boolean {
  const d = parseRuDateDdMmYyyy(value);
  if (!d) {
    return false;
  }
  const cmp = startOfDay(d);
  const today = startOfToday();
  return cmp >= today;
}

/**
 * Срабатывает только если дата в ячейке — **ровно** один из календарных дней «сегодня + N»
 * (локальное время процесса Node). Не диапазон: если N=10, подойдёт только строка с датой
 * ровно через 10 дней; строки с прошлыми датами или «в середине» окна не попадут.
 *
 * Для теста только «через 10 дней» задайте: `[10]`. Раньше было «завтра и послезавтра»: `[1, 2]`.
 */
const NOTIFY_DAY_OFFSETS_FROM_TODAY: readonly number[] = [1, 2];

export function isRuDateTomorrowOrDayAfterTomorrow(value: string): boolean {
  const d = parseRuDateDdMmYyyy(value);
  if (!d) {
    return false;
  }
  const rowDay = startOfDay(d);
  const today = startOfToday();
  return NOTIFY_DAY_OFFSETS_FROM_TODAY.some(
    (offset) =>
      rowDay.getTime() === startOfDay(addCalendarDays(today, offset)).getTime(),
  );
}

/** Для ячейки с URL Instagram — возвращает логин из пути; иначе исходный текст. */
export function nickFromInstagramOrText(value: string): string {
  const v = value.trim();
  const m = v.match(/instagram\.com\/([^/?#]+)/i);
  if (!m) {
    return v;
  }
  return decodeURIComponent(m[1]).replace(/^@/, '');
}

export function mapSheetRowToClientRow(row: string[]): ClientSheetRow | null {
  if (row.length === 0) {
    return null;
  }
  const p = padRow(row, COLUMN_COUNT);
  if (!p.some((c) => c.trim() !== '')) {
    return null;
  }
  return {
    клиент: cellAt(p, 0),
    источник: cellAt(p, 1),
    дата: cellAt(p, 2),
    ник: nickFromInstagramOrText(cellAt(p, 3)),
    услуга: cellAt(p, 4),
    стоимость: cellAt(p, 5),
  };
}

export function mapSheetValuesToClientRows(
  values: string[][],
  options?: { skipHeaderRow?: boolean },
): ClientSheetRow[] {
  const rows = options?.skipHeaderRow ? values.slice(1) : values;
  return rows
    .map((r) => mapSheetRowToClientRow(r))
    .filter((r): r is ClientSheetRow => r !== null);
}
