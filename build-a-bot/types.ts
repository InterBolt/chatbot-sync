import { z } from "zod";

export const skillSchema = z.object({
  name: z.string(),
  description: z.string(),
  instruction: z.string(),
});

export const datasetFileSchema = z.object({
  filePath: z.string(),
  contents: z.string(),
});

export const systemSchema = z.object({
  backstory: z.string(),
  mismatched: z.string(),
  matched: z.string(),
});

export const botBaseSchema = z.object({
  botId: z.string().optional(),
  name: z.string(),
  skills: z.array(skillSchema),
  datasetFiles: z.array(datasetFileSchema),
  system: systemSchema,
});

export const deploymentSchema = z.object({
  updatedAt: z.string(),
  name: z.string(),
  botId: z.string(),
  skills: z.array(
    z.object({
      name: z.string(),
      updatedAt: z.string(),
    })
  ),
  datasetFiles: z.array(
    z.object({
      fileName: z.string(),
      updatedAt: z.string(),
    })
  ),
});

export const botSchema = botBaseSchema
  .merge(
    z.object({
      deployment: deploymentSchema.nullable(),
    })
  )
  .strict();

export const parseBot = (bot: any) => {
  try {
    const parsedBot = botSchema.parse(bot);
    if (!parsedBot.system.matched.includes("{search}")) {
      throw new Error(
        `Match prompt ${parsedBot.name}/system/matched.txt must include {search}`
      );
    }
    if (!parsedBot.system.mismatched.includes("{search}")) {
      throw new Error(
        `Match prompt ${parsedBot.name}/system/mismatched.txt must include {search}`
      );
    }
    return bot;
  } catch (err: any) {
    console.error(
      `Bot parsing error: ${err.message}. \nFound: ${JSON.stringify(
        bot,
        null,
        2
      )}`
    );
    process.exit(1);
  }
};

export const parseDeployment = (deployment: any) => {
  try {
    const parsedDeployment = deploymentSchema.parse(deployment);
    return parsedDeployment;
  } catch (err: any) {
    console.error(
      `Deployment parsing error: ${err.message}. \nFound: ${JSON.stringify(
        deployment,
        null,
        2
      )}`
    );
    process.exit(1);
  }
};

export type DatasetFile = z.infer<typeof datasetFileSchema>;

export type Deployment = z.infer<typeof deploymentSchema>;

export type Bot = z.infer<typeof botSchema>;

export type DynamicBotBuilder = (
  fileBot: Partial<Bot>
) => Promise<Partial<Omit<Bot, "deployment" | "name">>>;
