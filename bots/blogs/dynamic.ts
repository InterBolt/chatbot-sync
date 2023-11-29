import type { DynamicBotBuilder } from "../../build-a-bot/types";

const dynamicBot: DynamicBotBuilder = async (fileBot) => {
  return {
    skills: [
      {
        name: "random-facts",
        description: "Some random facts about me",
        instruction: "Tell me about yourself",
      },
      ...(fileBot.skills || []),
    ],
  };
};

export default dynamicBot;
