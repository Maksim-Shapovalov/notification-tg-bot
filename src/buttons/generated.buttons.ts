import { Markup } from 'telegraf';
import { InlineKeyboardButton, InlineKeyboardMarkup } from 'telegraf/types';
import { baseButtons } from './buttons.dataset';

export const mainMenuButtons = (isActive: boolean): InlineKeyboardMarkup => {
  const mainMenuButtons: InlineKeyboardButton[][] = [
    isActive
      ? [
          Markup.button.callback(
            baseButtons.stop.text,
            baseButtons.stop.callback_data,
          ),
        ]
      : [
          Markup.button.callback(
            baseButtons.start.text,
            baseButtons.start.callback_data,
          ),
        ],
    [
      Markup.button.callback(
        baseButtons.changeTimeToNotify.text,
        baseButtons.changeTimeToNotify.callback_data,
      ),
    ],
  ];

  return {
    inline_keyboard: mainMenuButtons,
  };
};
