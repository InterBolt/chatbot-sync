import { cbk } from "./chatbotkit";
import prompts from "prompts";
import log from "./log";
import { warningCountdown } from "./utils";

const destroy = async () => {
  const { confirmRun } = await prompts({
    type: "confirm",
    name: "confirmRun",
    initial: false,
    message: `This is the DESTROY script. It will destroy all of your bots in Chatbotkit!!! Are you sure you want to proceed?`,
  });

  if (!confirmRun) {
    log.info(`Aborting.`);
    process.exit(0);
  }

  const { items: bots } = await cbk.bot.list();
  const { items: datasets } = await cbk.dataset.list();
  const { items: files } = await cbk.file.list();
  const { items: skills } = await cbk.skillset.list();
  const abilities = await Promise.all(
    skills.map(async (skill: any) =>
      ((await cbk.skillset.ability.list(skill.id))?.items || []).map(
        (ability: any) => ({
          ...ability,
          skillId: skill.id,
        })
      )
    )
  );

  const botsToDelete = bots.filter((b: any) => !!b.meta?.buildABot);
  const datasetsToDelete = datasets.filter((d: any) => !!d.meta?.buildABot);
  const filesToDelete = files.filter((f: any) => !!f.meta?.buildABot);
  const skillsToDelete = skills.filter((s: any) => !!s.meta?.buildABot);
  const abilitiesToDelete = abilities
    .flat()
    .filter((a: any) => !!a.meta?.buildABot);

  const { confirmedDelete } = await prompts({
    type: "confirm",
    name: "confirmedDelete",
    initial: false,
    message: `Are you sure you want to delete ${datasetsToDelete.length} datasets, ${filesToDelete.length} files, ${skillsToDelete.length} skills, ${abilitiesToDelete.length} abilities, and ${botsToDelete.length} bots?`,
  });

  if (!confirmedDelete) {
    log.info(`Aborting.`);
    process.exit(0);
  }

  log.warn(`About to delete a bunch of stuff.`, `Proceeding in 5 seconds...`);
  await warningCountdown(5);

  // Prevent weird states by deleting secondary resources first.
  log.info(`Deleting files and abilities`);
  const secondaryResourceDeletionResults = await Promise.all(
    [
      filesToDelete.map((f: any) => cbk.file.delete(f.id)),
      abilitiesToDelete.map((a: any) =>
        cbk.skillset.ability.delete(a.skillId, a.id)
      ),
    ].flat()
  );

  // Then delete primary resources.
  log.info(`Deleting datasets and skills`);
  const primaryResourceDeletionResults = await Promise.all(
    [
      datasetsToDelete.map((d: any) => cbk.dataset.delete(d.id)),
      skillsToDelete.map((s: any) => cbk.skillset.delete(s.id)),
    ].flat()
  );

  // And finally, delete the bots.
  log.info(`Deleting bots`);
  const botDeletionResources = await Promise.all(
    botsToDelete.map((b: any) => cbk.bot.delete(b.id))
  );

  log.success(
    `Deleted ${
      secondaryResourceDeletionResults.length +
      primaryResourceDeletionResults.length
    } resources and ${botDeletionResources.length} bots.`
  );
};

destroy();
