import colors from "colors/safe";

const PREFIXES = {
  wait: colors.white(colors.bold("○")),
  error: colors.red(colors.bold("⨯")),
  warn: colors.yellow(colors.bold("⚠")),
  success: colors.green(colors.bold("✓")),
  info: colors.magenta(colors.bold("»")),
};

const info = (message: string, suffix?: string) =>
  console.log(
    ` ${PREFIXES.info} ${message}${
      suffix ? `: ${colors.bold(colors.blue(suffix))}` : ""
    }`
  );

const success = (message: string, suffix?: string) =>
  console.log(
    ` ${PREFIXES.success} ${message}${
      suffix ? `: ${colors.bold(colors.green(suffix))}` : ""
    }`
  );

const warn = (message: string, suffix?: string) =>
  console.log(
    ` ${PREFIXES.warn} ${message}${
      suffix ? `: ${colors.bold(colors.yellow(suffix))}` : ""
    }`
  );

const error = (message: string, suffix?: string) =>
  console.log(
    ` ${PREFIXES.error} ${colors.bold(colors.red(message))}${
      suffix ? `: ${colors.bold(colors.red(suffix))}` : ""
    }`
  );

const wait = (message: string, suffix?: string) =>
  console.log(
    ` ${PREFIXES.wait} ${message}${
      suffix ? `: ${colors.bold(colors.cyan(suffix))}` : ""
    }`
  );

const verbose = (message: string, suffix?: string) =>
  process.env.VERBOSE === "true" ? info(message, suffix) : null;

const log = {
  info,
  success,
  warn,
  error,
  wait,
  verbose,
};

export default log;
