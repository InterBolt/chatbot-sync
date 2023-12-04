import { set, template } from "lodash";
import log from "./log";
import { glob } from "glob";
import { readFileSync, statSync } from "fs";
import { memfs } from "memfs";

export const { vol: memVol, fs: memFs } = memfs();

// Maps real filesystem into memory filesystem for easier
// pre-processing and parsing.
export const initMemFS = async (botsDir: string) => {
  const botFiles = await glob(`${botsDir}/**/*`, { ignore: ["**/.gitkeep"] });
  if (botFiles.length === 0) {
    log.warn("No bots found. Exiting.");
    process.exit(0);
  }
  const jsonVol: any = {};
  botFiles.forEach((botFile) => {
    const isDir = statSync(botFile).isDirectory();
    if (!isDir) {
      const fileContents = readFileSync(botFile, "utf8");
      jsonVol[botFile] = fileContents;
    }
  });
  memVol.fromJSON(jsonVol);
  return botFiles;
};

// Finds the variables.ts files and injects the variables into the
// bot files.
export const preprocessMemFS = async (botsDir: string) => {
  const botFiles = Object.keys(memVol.toJSON());

  const botsVariablesFiles = await Promise.all(
    botFiles
      .filter((file) => file.endsWith("/variables.ts"))
      .filter(
        (buildFilePath) =>
          buildFilePath.replace(`${botsDir}/`, "").split("/").length === 2
      )
  );

  // Get the list of botNames associated with the found variables.ts files.
  const botNames = botsVariablesFiles.map(
    (file) => file.split("/").at(-2) as string
  );

  // Import the variables.ts files and build the bo
  const botsVariables = await Promise.all(
    botsVariablesFiles.map(async (filePath, i) => {
      const builder = await import(filePath);
      const botVariables: Record<string, string> = await builder.default();
      return botVariables;
    })
  );

  const botVars = botsVariables.reduce((accum, botVariables, i) => {
    const botName = botNames[i];
    set(accum, [botName], botVariables);
    return accum;
  }, {} as Record<string, Record<string, string>>);

  let foundErr: any = null;

  // inject the template variables into each bots files
  Object.keys(memVol.toJSON()).forEach((filePath) => {
    const botName = filePath
      .replace(botsDir, "")
      .split("/")
      .filter((e) => e)[0];
    const botVariables = botVars[botName];
    if (botVariables) {
      const fileContent = memFs.readFileSync(filePath, "utf8") || "";
      const compiled = template(fileContent as string);
      try {
        const injected = compiled(botVariables);
        memFs.writeFileSync(filePath, injected);
      } catch (err) {
        log.error(`Found undefined template variable at: ${filePath}`);
        foundErr = err;
      }
    }
  });

  if (foundErr) {
    throw foundErr;
  }
};
