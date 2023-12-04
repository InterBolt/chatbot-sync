import { glob } from "glob";
import { mapValues, merge, set, get, isEmpty } from "lodash";
import { isAbsolute, resolve } from "path";
import { Bot, parseBot } from "./types";
import { initMemFS, preprocessMemFS, memFs } from "./memFs";

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
      memFs.readFileSync(treeFile, "utf-8")
    );
  }

  return tree;
};

const extractAbilities = async (
  filePaths: Array<string>
): Promise<Record<string, Pick<Bot, "abilities">>> => {
  const search = "/abilities/";
  const abilities = filePaths.reduce((accum, filePath) => {
    if (filePath.includes(search)) {
      const parentDir = filePath.split(search)[0];
      const abilityName = filePath.split(search)[1].split("/")[0];
      const abilityDir = resolve(parentDir, `abilities`, abilityName);
      if (!memFs.statSync(abilityDir).isDirectory()) {
        throw new Error(`Ability path ${abilityDir} is not a directory`);
      }
      const botName = parentDir.split("/").at(-1) as string;
      set(accum, [botName, abilityName], abilityDir);
    }
    return accum;
  }, {} as Record<string, Record<string, string>>);

  const abilitiesToParse = Object.entries(abilities);
  const botAbilities: Record<string, Pick<Bot, "abilities">> = {};
  for (let [botName, ability] of abilitiesToParse) {
    const abilityName = Object.keys(ability)[0];
    const files = await parseFiles(ability[abilityName], {
      exactFiles: ["instruction.txt", "description.txt"],
    });
    if (!Array.isArray(get(botAbilities, [botName, "abilities"]))) {
      set(botAbilities, [botName, "abilities"], []);
    }
    get(botAbilities, [botName, "abilities"]).push({
      name: abilityName,
      instruction: files["instruction"],
      description: files["description"],
    });
  }

  return botAbilities;
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
      if (!memFs.statSync(datasetDir).isDirectory()) {
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
): Promise<Record<string, Pick<Bot, "identity">>> => {
  const search = "/identity/";
  const identityDirs = filePaths.reduce((accum, filePath) => {
    if (filePath.includes(search)) {
      const parentDir = filePath.split(search)[0];
      const identityDir = resolve(parentDir, `identity`);
      const botName = parentDir.split("/").at(-1) as string;
      if (!memFs.statSync(identityDir).isDirectory()) {
        throw new Error(`Dataset path ${identityDir} is not a directory`);
      }
      accum[botName] = identityDir;
    }
    return accum;
  }, {} as Record<string, string>);

  const botSystems: Record<string, Pick<Bot, "identity">> = {};
  for (let [botName, identityDir] of Object.entries(identityDirs)) {
    const parsedFiles = await parseFiles(identityDir);
    set(botSystems, [botName, "identity"], {
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
  if (memFs.existsSync(deploymentPath)) {
    deployment = JSON.parse(
      memFs.readFileSync(deploymentPath, "utf-8") as string
    );
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
      await extractAbilities(botFiles),
      await extractDatasets(botFiles),
      await extractSystem(botFiles)
    ),
    (partialBot: any, name: string) =>
      parseBot({
        ...partialBot,
        abilities: partialBot.abilities || [],
        datasetFiles: partialBot.datasetFiles || [],
        name,
        deployment: extractDeployment(botsDir, name),
      })
  );
};

const parse = async (botsDir: string): Promise<Record<string, Bot>> => {
  // Loads all bot files into memory so we can use memfs
  const botFiles = await initMemFS(botsDir);

  // Preprocesses file contents by injecting variables.
  await preprocessMemFS(botsDir);

  // Generate the bots from the files.
  const fileBots = await parseFileBots(botsDir, botFiles);

  // Get the list of bot names.
  const botNames = Object.keys(fileBots);

  // Merge the file bots and dynamic bots.
  const bots: Record<string, Bot> = {};
  for (const botName of botNames) {
    set(bots, [botName], merge({}, fileBots[botName]));
    set(bots, [botName, "name"], botName);
  }

  // Return the bots and parse them for type safety.
  const returnBots = mapValues(bots, (value) => parseBot(value));

  return returnBots;
};

export default parse;
