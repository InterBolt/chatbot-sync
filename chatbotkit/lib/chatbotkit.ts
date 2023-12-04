import { ChatBotKit } from "@chatbotkit/sdk";
import log from "./log";
import { resolve } from "path";
import { existsSync } from "fs";
import dotenv from "dotenv";

const buildCbk = () => {
  const pathToEnv = resolve(process.cwd(), ".env");

  if (!existsSync(pathToEnv)) {
    log.error(
      `Missing .env file in the root of the project. If you just cloned the repo, run "mv example-env .env".`
    );
    process.exit(1);
  }

  const { parsed: ENV } = dotenv.config({
    path: resolve(process.cwd(), ".env"),
  });

  const secret = ENV?.CHATBOTKIT_API_KEY || "";
  if (!secret) {
    log.error(`Missing CHATBOTKIT_API_KEY in .env file.`);
    process.exit(1);
  }

  return new ChatBotKit({ secret });
};

const asyncCalls: any = {
  succeeded: [],
  failed: [],
};

const trackAsyncCalls = (obj: any): any => {
  return new Proxy(obj, {
    get: (target, prop) => {
      if (typeof target[prop] === "object" && target[prop] !== null) {
        return trackAsyncCalls(target[prop]);
      }
      if (typeof target[prop] === "function") {
        return (...args: any[]) => {
          const returned = target[prop](...args);

          if (typeof returned.then !== "undefined") {
            return new Promise((resolve: any, reject: any) => {
              returned
                .then((...args: any[]) => {
                  asyncCalls.succeeded.push({
                    method: target.name,
                    args,
                    response: args[0],
                  });
                  resolve(...args);
                })
                .catch((...args: any[]) => {
                  asyncCalls.failed.push({
                    method: target.name,
                    args,
                    response: args[0],
                  });
                  reject(...args);
                });
            });
          }

          return returned;
        };
      }
      return target[prop];
    },
  });
};

export const cbk: ChatBotKit = trackAsyncCalls(buildCbk());

const reportStats = () => {
  if (asyncCalls.succeeded.length > 0) {
    log.warn(
      `Fulfilled ${asyncCalls.succeeded.length} asyncCalls to ChatBotKit`
    );
    log.verbose(
      `Fulfilled log (latest - oldest)`,
      `\n${JSON.stringify(asyncCalls.succeeded, null, 2)
        .split("\n")
        .map((str) => ` ${str}`)
        .join("\n")}`
    );
  }
  if (asyncCalls.failed.length > 0) {
    log.verbose(
      `Failed log (latest - oldest)`,
      `\n${JSON.stringify(asyncCalls.failed, null, 2)
        .split("\n")
        .map((str) => ` ${str}`)
        .join("\n")}`
    );
  }
};

// do app specific cleaning before exiting
process.on("exit", reportStats);

// catch ctrl+c event and exit normally
process.on("SIGINT", function () {
  console.log("Ctrl-C...");
  process.exit(2);
});

//catch uncaught exceptions, trace, then exit normally
process.on("uncaughtException", function (e) {
  console.log("Uncaught Exception...");
  console.log(e.stack);
  process.exit(99);
});
