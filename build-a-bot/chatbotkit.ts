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

const requests: any = {
  succeeded: [],
  failed: [],
};

const recursiveProxy = (obj: any): any => {
  return new Proxy(obj, {
    get: (target, prop) => {
      if (typeof target[prop] === "object" && target[prop] !== null) {
        return recursiveProxy(target[prop]);
      }
      return target[prop];
    },
    apply(target, thisArg, argArray) {
      const returned = target.call(thisArg, ...argArray);

      if (typeof returned.then === "function") {
        return new Promise((resolve: any, reject: any) => {
          returned
            .then((...args: any[]) => {
              requests.succeeded.push({
                method: target.name,
                args,
                response: args[0],
              });
              resolve(...args);
            })
            .catch((...args: any[]) => {
              requests.failed.push({
                method: target.name,
                args,
                response: args[0],
              });
              reject(...args);
            });
        });
      }

      return returned;
    },
  });
};

export const cbk = recursiveProxy(buildCbk());

const reportStats = () => {
  if (requests.succeeded.length > 0) {
    log.warn(`Fulfilled ${requests.succeeded.length} requests to ChatBotKit`);
    log.info(
      `Fulfilled log (latest - oldest)`,
      `\n${JSON.stringify({ bit: ["asdf"], ok: "asdf" }, null, 2)
        .split("\n")
        .map((str) => ` ${str}`)
        .join("\n")}`
    );
  }
  if (requests.failed.length > 0) {
    log.info(
      `Failed log (latest - oldest)`,
      `\n${JSON.stringify(requests.failed, null, 2)
        .split("\n")
        .map((str) => ` ${str}`)
        .join("\n")}`
    );
  }
};

export const reportRequestDataWhenProcessExits = () => {
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
};
