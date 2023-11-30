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
};

export const parseDeployment = (deployment: any) => {
  const parsedDeployment = deploymentSchema.parse(deployment);
  return parsedDeployment;
};

export type DatasetFile = z.infer<typeof datasetFileSchema>;

export type Deployment = z.infer<typeof deploymentSchema>;

export type Bot = z.infer<typeof botSchema>;

export type DynamicBotBuilder = (
  fileBot: Partial<Bot>
) => Promise<Partial<Omit<Bot, "deployment" | "name">>>;
