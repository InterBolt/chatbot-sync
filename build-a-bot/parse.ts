import { glob } from "glob";
import { mapValues, merge, set, get, uniq, isEmpty } from "lodash";
import { isAbsolute, resolve } from "path";
import { Bot, parseBot } from "./types";
import { statSync, existsSync, readFileSync } from "fs";
import { readFile } from "fs/promises";
import colors from "colors/safe";
import log from "./log";

const parseFiles = async (
  dir: string,
  opts?: { exactFiles?: Array<string>; requiredFiles?: Array<string> }
): Promise<any> => {
  const { exactFiles = null, requiredFiles = null } = opts || {};

  // Grab a list of all files in the dir.
  const foundFiles = await glob(`${dir}/**/*`);

  // Throw if we want exact and the found count doesn't match.
  if (exactFiles && foundFiles.length !== exactFiles.length) {
    throw new Error(
      `Directory ${dir} must have exactly ${exactFiles.length} files`
    );
  }

  // Prefer exact files, otherwise use required files.
  const treeFiles = exactFiles || requiredFiles || foundFiles;

  // Could be made more efficient by skipping if we fell back to foundFiles.
  // But the less efficient version is easier to read.
  const treeFilePaths = treeFiles.map((checkFile) =>
    isAbsolute(checkFile) ? checkFile : resolve(dir, checkFile)
  );
  treeFilePaths.forEach((checkFile) => {
    if (foundFiles.indexOf(resolve(dir, checkFile)) === -1) {
      throw new Error(`File ${checkFile} not found in ${dir}`);
    }
  });

  // Read all the files into a tree and return the tree.
  const tree = {};
  for (let treeFile of treeFilePaths) {
    set(
      tree,
      treeFile
        .slice(0, treeFile.lastIndexOf("."))
        .replace(`${dir}/`, "")
        .replaceAll("/", "."),
      await readFile(treeFile, "utf-8")
    );
  }

  return tree;
};

const extractSkills = async (
  filePaths: Array<string>
): Promise<Record<string, Pick<Bot, "skills">>> => {
  const search = "/skills/";
  const skills = filePaths.reduce((accum, filePath) => {
    if (filePath.includes(search)) {
      const parentDir = filePath.split(search)[0];
      const skillName = filePath.split(search)[1].split("/")[0];
      const skillDir = resolve(parentDir, `skills`, skillName);
      if (!statSync(skillDir).isDirectory()) {
        throw new Error(`Skill path ${skillDir} is not a directory`);
      }
      const botName = parentDir.split("/").at(-1) as string;
      set(accum, [botName, skillName], skillDir);
    }
    return accum;
  }, {} as Record<string, Record<string, string>>);

  const skillsToParse = Object.entries(skills);
  const botSkills: Record<string, Pick<Bot, "skills">> = {};
  for (let [botName, skill] of skillsToParse) {
    const skillName = Object.keys(skill)[0];
    const files = await parseFiles(skill[skillName], {
      exactFiles: ["instruction.txt", "description.txt"],
    });
    if (!Array.isArray(get(botSkills, [botName, "skills"]))) {
      set(botSkills, [botName, "skills"], []);
    }
    get(botSkills, [botName, "skills"]).push({
      name: skillName,
      instruction: files["instruction"],
      description: files["description"],
    });
  }

  return botSkills;
};

const extractDatasets = async (
  filePaths: Array<string>
): Promise<Record<string, Pick<Bot, "datasetFiles">>> => {
  const search = "/dataset/";
  const datasetDirs = filePaths.reduce((accum, filePath) => {
    if (filePath.includes(search)) {
      const parentDir = filePath.split(search)[0];
      const datasetDir = resolve(parentDir, `dataset`);
      const botName = parentDir.split("/").at(-1) as string;
      if (!statSync(datasetDir).isDirectory()) {
        throw new Error(`Dataset path ${datasetDir} is not a directory`);
      }
      accum[botName] = datasetDir;
    }
    return accum;
  }, {} as Record<string, string>);

  const botDatasetFiles: Record<string, Pick<Bot, "datasetFiles">> = {};
  for (let [botName, datasetDir] of Object.entries(datasetDirs)) {
    const parsedFiles = await parseFiles(datasetDir);
    if (!Array.isArray(get(botDatasetFiles, [botName, "datasetFiles"]))) {
      set(botDatasetFiles, [botName, "datasetFiles"], []);
    }

    const datasetFiles = get(botDatasetFiles, [botName, "datasetFiles"]);
    Object.entries(parsedFiles).forEach((entry: any) => {
      const [name, contents] = entry;
      datasetFiles.push({
        filePath: resolve(datasetDir, `${name}.txt`),
        contents,
      });
    });
  }

  return botDatasetFiles;
};

const extractSystem = async (
  filePaths: Array<string>
): Promise<Record<string, Pick<Bot, "system">>> => {
  const search = "/system/";
  const systemDirs = filePaths.reduce((accum, filePath) => {
    if (filePath.includes(search)) {
      const parentDir = filePath.split(search)[0];
      const systemDir = resolve(parentDir, `system`);
      const botName = parentDir.split("/").at(-1) as string;
      if (!statSync(systemDir).isDirectory()) {
        throw new Error(`Dataset path ${systemDir} is not a directory`);
      }
      accum[botName] = systemDir;
    }
    return accum;
  }, {} as Record<string, string>);

  const botSystems: Record<string, Pick<Bot, "system">> = {};
  for (let [botName, systemDir] of Object.entries(systemDirs)) {
    const parsedFiles = await parseFiles(systemDir);
    set(botSystems, [botName, "system"], {
      backstory: parsedFiles["backstory"],
      mismatched: parsedFiles["mismatched"],
      matched: parsedFiles["matched"],
    });
  }

  return botSystems;
};

const extractDeployment = (botsDir: string, botName: string): any => {
  const deploymentPath = resolve(botsDir, botName, "deployment.json");
  let deployment = {};
  if (existsSync(deploymentPath)) {
    deployment = JSON.parse(readFileSync(deploymentPath, "utf-8"));
  }
  return isEmpty(deployment || {}) ? null : deployment;
};

const parseFileBots = async (
  botsDir: string,
  botFiles: Array<string>
): Promise<Record<string, Bot>> => {
  return mapValues(
    merge(
      {},
      await extractSkills(botFiles),
      await extractDatasets(botFiles),
      await extractSystem(botFiles)
    ),
    (partialBot: any, name: string) =>
      parseBot({
        ...partialBot,
        name,
        deployment: extractDeployment(botsDir, name),
      })
  );
};

const buildDynamicBots = async (
  botsDir: string,
  botFiles: Array<string>,
  fileBots: Record<string, Partial<Bot>>
) => {
  const botDynamicFiles = await Promise.all(
    botFiles
      .filter((file) => file.endsWith("/dynamic.ts"))
      .filter(
        (buildFilePath) =>
          buildFilePath.replace(`${botsDir}/`, "").split("/").length === 2
      )
  );

  // Get the list of botNames associated with the found dynamic.ts files.
  const botNames = botDynamicFiles.map(
    (file) => file.split("/").at(-2) as string
  );

  // Import the dynamic.ts files and build the bo
  const dynamicBots = await Promise.all(
    botDynamicFiles.map(async (filePath, i) => {
      const builder = await import(filePath);
      const built: Partial<Bot> = await builder.default(
        fileBots[botNames[i]] || {}
      );
      return built;
    })
  );

  // Find the deployment.json files if they exist.
  const deployments = botNames.map((name) => extractDeployment(botsDir, name));

  return botNames.reduce((accum, botName, i) => {
    accum[botName] = {
      ...dynamicBots[i],
      deployment: deployments[i],
    };
    return accum;
  }, {} as Record<string, Partial<Bot>>);
};

const parse = async (botsDir: string): Promise<Record<string, Bot>> => {
  const botFiles = await glob(`${botsDir}/**/*`, { ignore: ["**/.gitkeep"] });
  if (botFiles.length === 0) {
    log.warn("No bots found. Exiting.");
    process.exit(0);
  }

  // Generate the bots from the files.
  const fileBots = await parseFileBots(botsDir, botFiles);

  // Then use the generated bots to build the dynamic bots.
  const dynamicBots = await buildDynamicBots(botsDir, botFiles, fileBots);

  // Get the list of bot names.
  const botNames = uniq(Object.keys(dynamicBots).concat(Object.keys(fileBots)));

  // Merge the file bots and dynamic bots.
  const bots: Record<string, Bot> = {};
  for (const botName of botNames) {
    set(bots, [botName], merge({}, fileBots[botName], dynamicBots[botName]));
    set(bots, [botName, "name"], botName);
  }

  // Return the bots and parse them for type safety.
  const returnBots = mapValues(bots, (value) => parseBot(value));

  return returnBots;
};

export default parse;
