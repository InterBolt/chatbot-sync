import log from "./log";
import colors from "colors/safe";

export const prefix = `[build-a-bot]-`;

export const withPrefix = (botName: string) =>
  botName.startsWith(prefix) ? botName : `${prefix}${botName}`;

export const withoutPrefix = (botName: string) =>
  botName.replace(`${prefix}`, "");

export const prettyError = (err: any) => {
  if (err.message) {
    log.error(err.message + "\n");
    err.message = err.message.replace(
      `${err.message.toString()}`,
      colors.red("trace")
    );
  }
  console.log(err);
};

export const warningCountdown = async (seconds: number) => {
  log.warn(`Countdown`, `${seconds}`);
  for (let i = 0; i < seconds; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    log.warn(`Countdown`, `${seconds - i - 1}`);
  }
};
