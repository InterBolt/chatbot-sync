import parse from "./lib/parse";
import { Bot, Deployment, parseDeployment } from "./lib/types";
import { dirname, resolve } from "path";
import { writeFile } from "fs/promises";
import { cbk } from "./lib/chatbotkit";
import log from "./lib/log";
import { prettyError, withPrefix, withoutPrefix } from "./lib/utils";
import { existsSync } from "fs";

const cache: any = {};

const getFilename = (fullPath: string) =>
  fullPath.replace(`${dirname(fullPath)}/`, "");

const getCachedBot = async (botId: string) => {
  if (cache[botId]) {
    return cache[botId] as Awaited<ReturnType<typeof cbk.bot.fetch>>;
  }

  const bot = await cbk.bot.fetch(botId);
  cache[botId] = bot;
  return bot as Awaited<ReturnType<typeof cbk.bot.fetch>>;
};

const clearCachedBot = (botId: string) => {
  delete cache[botId];
};

const sdk_syncDatasetFiles = async (botId: string) => {
  const { datasetId } = await getCachedBot(botId);
  if (typeof datasetId !== "string") {
    throw new Error(`Bot ${botId} does not have a datasetId`);
  }
  const { items: files } = await cbk.dataset.file.list(datasetId);
  await Promise.all(
    files.map((file: any) => cbk.dataset.file.sync(datasetId, file.id, {}))
  );
};

const sdk_createBot = async (
  bot: Bot
): Promise<{ botId: string; botName: string }> => {
  const { system, name } = bot;
  const botName = withPrefix(name);

  log.verbose(`Initializing bot via API: ${withPrefix(botName)}`);
  const { id: botId } = await cbk.bot.create({
    model: "gpt-4-next",
    name: botName,
    description: "A bot created by the bot-scripts/deploy.ts script",
    backstory: system.backstory,
    meta: {
      buildABot: true,
    },
  });

  log.verbose(
    `Initializing bot's dataset and skillset via API: ${withPrefix(botName)}`
  );
  const [{ id: datasetId }, { id: skillsetId }] = await Promise.all([
    cbk.dataset.create({
      store: "ada-sprout",
      name: botName,
      description: "A dataset created by the bot-scripts/deploy.ts script",
      matchInstruction: system.matched,
      mismatchInstruction: system.mismatched,
      meta: {
        botId,
        buildABot: true,
      },
    }),
    cbk.skillset.create({
      name: botName,
      description: "A skillset created by the bot-scripts/deploy.ts script",
      meta: {
        botId,
        buildABot: true,
      },
    }),
  ]);

  log.verbose(`Attaching skillset and dataset to bot: ${withPrefix(botName)}`);
  await cbk.bot.update(botId, {
    datasetId,
    skillsetId,
  });

  return {
    botName,
    botId,
  };
};

const sdk_exists = async (botId: string) => {
  try {
    log.verbose(`Checking if bot exists: ${botId}`);
    const bot = await cbk.bot.fetch(botId);
    return !!bot?.id;
  } catch (err: any) {
    return false;
  }
};

const sdk_updateBotSystem = async (botId: string, system: Bot["system"]) => {
  const { datasetId } = await getCachedBot(botId);
  log.verbose(
    `Updating dataset matchInstruction and mismatchInstruction: ${datasetId}`
  );
  await cbk.dataset.update(datasetId as string, {
    matchInstruction: system.matched,
    mismatchInstruction: system.mismatched,
  });
  log.verbose(`Updating bot backstory: ${botId}`);
  await cbk.bot.update(botId, {
    backstory: system.backstory,
  });
};

const sdk_updateName = async (botId: string, newName: string) => {
  const botName = withPrefix(newName);
  const bot = await cbk.bot.fetch(botId);

  log.verbose(`Updating bot name: ${bot.name} -> ${botName}`);
  await cbk.bot.update(botId, {
    name: botName,
  });

  log.verbose(`Updating dataset name: ${bot.name} -> ${botName}`);
  await cbk.dataset.update(bot.datasetId as string, {
    name: botName,
  });

  log.verbose(`Updating skillset name: ${bot.name} -> ${botName}`);
  await cbk.skillset.update(bot.skillsetId as string, {
    name: botName,
  });
};

const sdk_detachDatasetFiles = async (botId: string) => {
  const { items } = await cbk.file.list();
  const associatedFiles = items.filter(
    (item: any) => item.meta?.botId === botId
  );

  log.verbose(
    `Detaching ${associatedFiles.length} dataset files for bot: ${botId}`
  );
  for (let item of associatedFiles) {
    log.verbose(`Deleting file: ${item.name}`);
    await cbk.file.delete(item.id as string);
  }
};

const sdk_attachDatasetFiles = async (
  botId: string,
  datasetFiles: Bot["datasetFiles"]
) => {
  const { datasetId } = await getCachedBot(botId);
  for (let datasetFile of datasetFiles) {
    log.verbose(`Creating dataset file: ${datasetFile.filePath}`);
    const { id: fileId } = await cbk.file.create({
      name: getFilename(datasetFile.filePath),
      description: "A file created by the bot-scripts/deploy.ts script",
      meta: {
        botId,
        buildABot: true,
      },
    });

    log.verbose(`Uploading dataset file: ${datasetFile.filePath}`);
    const fileName = getFilename(datasetFile.filePath);
    await cbk.file.upload(fileId, {
      name: fileName,
      type: "text/csv",
      data: new TextEncoder().encode(datasetFile.contents),
    });

    log.verbose(`Attaching dataset file: ${datasetFile.filePath}`);
    await cbk.dataset.file.attach(datasetId as string, fileId, {
      type: "source",
    });
  }
};

const sdk_removeSkills = async (botId: string) => {
  const { skillsetId } = await getCachedBot(botId);
  const { items } = await cbk.skillset.ability.list(skillsetId as string);
  for (let item of items) {
    log.verbose(`Removing skill ability: ${item.name}`);
    await cbk.skillset.ability.delete(skillsetId as string, item.id as string);
  }
};

const sdk_createSkills = async (botId: string, skills: Bot["skills"]) => {
  const { skillsetId } = await getCachedBot(botId);
  for (let skill of skills) {
    log.verbose(`Creating skill ability: ${skill.name}`);
    await cbk.skillset.ability.create(skillsetId as string, {
      name: skill.name,
      description: skill.description,
      instruction: skill.instruction,
      meta: {
        botId,
        buildABot: true,
      },
    });
  }
};

const cleanupIncompleteBot = async (botId: string) => {
  // Reset the bot cache to be safe
  clearCachedBot(botId);

  // Get the dataset and skillset for the bot
  const { items: datasets } = await cbk.dataset.list();
  const dataset = datasets.find((d: any) => d.meta?.botId === botId);
  const { items: skillsets } = await cbk.skillset.list();
  const skillset = skillsets.find((s: any) => s.meta?.botId === botId);

  // Attempt to delete the bot, dataset, and skillset
  try {
    if (skillset) {
      log.verbose(`Deleting skillset for incomplete bot: ${botId}`);
      await cbk.skillset.delete(skillset.id);
      log.warn(`Force removed skills from bot: ${botId}`);
    }
  } catch (err) {
    console.error(err);
    log.error(`Failed to remove skills from bot: ${botId}`);
  }
  try {
    if (dataset) {
      log.verbose(`Deleting dataset for incomplete bot: ${botId}`);
      await cbk.dataset.delete(dataset.id);
      log.warn(`Force removed skills from bot: ${botId}`);
    }
  } catch (err) {
    console.error(err);
    log.error(`Failed to remove skills from bot: ${botId}`);
  }
  try {
    log.verbose(`Deleting incomplete bot: ${botId}`);
    await cbk.bot.delete(botId);
    log.warn(`Force deleted bot: ${botId}`);
  } catch (err) {
    console.error(err);
    log.error(`Failed to delete bot: ${botId}`);
  }
};

const createBot = async (bot: Bot) => {
  // Create the bot and get the botId
  const { botId } = await sdk_createBot(bot);
  log.info(`Created ignorant bot`, `${withPrefix(bot.name)}`);

  try {
    // Ensure that the deployment info is correct before creating
    // the dataset files and skills.
    const nextDeployment = parseDeployment({
      botId,
      name: withPrefix(bot.name),
      updatedAt: new Date().toString(),
      datasetFiles: bot.datasetFiles.map((b) => ({
        fileName: getFilename(b.filePath),
        updatedAt: new Date().toString(),
      })),
      skills: bot.skills.map((b) => ({
        name: b.name,
        updatedAt: new Date().toString(),
      })),
    });

    // Attach the dataset files and create the skills
    await sdk_attachDatasetFiles(nextDeployment.botId, bot.datasetFiles);
    log.info(
      `Attached dataset files to bot`,
      ` ${withPrefix(nextDeployment.name)}`
    );

    await sdk_createSkills(nextDeployment.botId, bot.skills);
    log.info(`Created skills for bot`, ` ${withPrefix(nextDeployment.name)}`);

    await sdk_syncDatasetFiles(nextDeployment.botId);
    log.info(`Synced dataset files for bot`, ` ${withPrefix(bot.name)}`);

    return nextDeployment;
  } catch (err: any) {
    if (err?.message) log.error(err.message);
    console.error(err);
    await cleanupIncompleteBot(botId);
  }
};

const updateBot = async (bot: Bot) => {
  const botId = (bot.deployment as Deployment).botId;

  // Ensure that the deployment info is correct
  // before making requests.
  const nextDeployment = parseDeployment({
    botId,
    name: withPrefix(bot.name),
    updatedAt: new Date().toString(),
    datasetFiles: bot.datasetFiles.map((b) => ({
      fileName: getFilename(b.filePath),
      updatedAt: new Date().toString(),
    })),
    skills: bot.skills.map((s) => ({
      name: s.name,
      updatedAt: new Date().toString(),
    })),
  });

  // Update the bot name if it has changed
  const prevName = (bot.deployment as Deployment).name;
  if (nextDeployment.name !== prevName) {
    await sdk_updateName(nextDeployment.botId, nextDeployment.name);
    log.info(
      `Updated bot name`,
      `${withPrefix(prevName)} => ${withPrefix(nextDeployment.name)}`
    );
  }

  await sdk_updateBotSystem(nextDeployment.botId, bot.system);
  log.info(`Updated system prompts`, nextDeployment.name);

  await sdk_detachDatasetFiles(nextDeployment.botId);
  log.info(`Detached dataset files`, nextDeployment.name);

  await sdk_removeSkills(nextDeployment.botId);
  log.info(`Removed abilities`, nextDeployment.name);

  await sdk_attachDatasetFiles(nextDeployment.botId, bot.datasetFiles);
  log.info(`Re-uploaded and attached files to dataset`, nextDeployment.name);

  await sdk_createSkills(nextDeployment.botId, bot.skills);
  log.info(`Recreated abilities`, nextDeployment.name);

  await sdk_syncDatasetFiles(nextDeployment.botId);
  log.info(`Synced dataset files`, nextDeployment.name);

  return nextDeployment;
};

// We need to do this in script because chatbotkit allows bots to have the
// same name, but we don't want to allow that since I think its confusing
const getHasNamingConflict = async (nextName: string) => {
  const [{ items: bots }, { items: datasets }, { items: skillsets }]: [
    { items: Array<{ name: string }> },
    { items: Array<{ name: string }> },
    { items: Array<{ name: string }> }
  ] = await Promise.all([
    cbk.bot.list(),
    cbk.dataset.list(),
    cbk.skillset.list(),
  ]);

  return [bots, datasets, skillsets]
    .flat()
    .map((item) => item.name)
    .includes(nextName);
};

const sync = async () => {
  try {
    const botsDirname = "bots";
    const botsDir = resolve(process.cwd(), botsDirname);

    if (!existsSync(botsDir)) {
      throw new Error(
        `The bots directory does not exist. Please create a directory named "${botsDirname}" in the root of your project.`
      );
    }

    const bots = await parse(botsDir);

    const startTime = Date.now();

    log.wait(
      `Managing ${Object.keys(bots).length} bots`,
      Object.keys(bots)
        .map((name) => withPrefix(name))
        .join(", ")
    );

    const toDeploy = [];
    const toUpdate = [];

    for (let botName in bots) {
      const bot = bots[botName];
      const botId = bot.deployment?.botId as string;

      // Check if the bot already exists
      const foundDeploy = botId ? await sdk_exists(botId) : false;

      // Reset the bot cache to be safe
      clearCachedBot(botId);

      const isUpdating = foundDeploy;

      const nextName = withPrefix(botName);
      const hasNamingConflict = await getHasNamingConflict(nextName);
      if (isUpdating && !hasNamingConflict) {
        throw new Error(
          `Bot name "${nextName}" does not exist. The update attempt would fail so we're exiting early.`
        );
      }
      if (!isUpdating && hasNamingConflict) {
        throw new Error(
          `Bot name "${nextName}" is already in use. Please rename the bot in the "bots" directory or in the chatbotkit UI.`
        );
      }

      isUpdating ? toUpdate.push(bot) : toDeploy.push(bot);
    }

    for (let bot of toDeploy) {
      // If the bot exists, update it. Otherwise, create it.
      const deployment = await createBot(bot);

      log.info(`Deployed new bot`, `${withPrefix(bot.name)}`);

      // Store the deployment info in the bot's directory
      await writeFile(
        resolve(botsDir, withoutPrefix(bot.name), "deployment.json"),
        JSON.stringify(deployment, null, 2)
      );

      log.info(`Stored deployment info for bot`, `${withPrefix(bot.name)}`);
    }

    for (let bot of toUpdate) {
      // If the bot exists, update it. Otherwise, create it.
      const deployment = await updateBot(bot);

      log.info(`Updated previously deployed bot`, `${withPrefix(bot.name)}`);

      // Store the deployment info in the bot's directory
      await writeFile(
        resolve(botsDir, withoutPrefix(bot.name), "deployment.json"),
        JSON.stringify(deployment, null, 2)
      );

      log.info(`Stored deployment info for bot`, `${withPrefix(bot.name)}`);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    log.success(`Deployed all bots in `, `${duration / 1000} seconds`);
  } catch (err: any) {
    prettyError(err);
  }
};

sync();
