import { Context } from 'telegraf';
import { AppService } from './app.service';
import { Action, Ctx, Start, Update } from 'nestjs-telegraf';
import { mainMenuButtons } from 'src/buttons/generated.buttons';
import { baseButtons } from 'src/buttons/buttons.dataset';

@Update()
export class AppUpdate {
  constructor(private readonly appService: AppService) {}

  @Start()
  async start(@Ctx() ctx: Context) {
    const domainId = ctx.from?.id;
    if (!domainId) {
      return ctx.reply('Please start the bot in a private chat with the bot.');
    }
    const user = await this.appService.getUserOrCreate(domainId);

    await ctx.reply("Let's start checking your clients!", {
      reply_markup: mainMenuButtons(user.isActive),
    });
  }

  @Action(baseButtons.start.callback_data)
  async startNotify(@Ctx() ctx: Context) {
    await ctx.answerCbQuery().catch(() => null);
    const domainId = ctx.from?.id;
    if (!domainId) {
      return ctx.reply('Please start the bot in a private chat with the bot.');
    }
    const user = await this.appService.changeUserActiveStatus(domainId, true);

    await ctx.reply("Let's start checking your clients!", {
      reply_markup: mainMenuButtons(user.isActive),
    });
  }
  @Action(baseButtons.stop.callback_data)
  async stopNotify(@Ctx() ctx: Context) {
    await ctx.answerCbQuery().catch(() => null);
    const domainId = ctx.from?.id;
    if (!domainId) {
      return ctx.reply('Please start the bot in a private chat with the bot.');
    }
    const user = await this.appService.changeUserActiveStatus(domainId, false);

    await ctx.reply("Let's start checking your clients!", {
      reply_markup: mainMenuButtons(user.isActive),
    });
  }
}
