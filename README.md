![X (formerly Twitter) Follow](https://img.shields.io/twitter/follow/interbolt_colin)

**This work is based on [ChatBotKit](https://chatbotkit.com/)'s open sourced node-sdk, but is not officially endorsed or sponsored by the company.**

# Chatbot Sync

A set of scripts to manage [ChatBotKit](https://chatbotkit.com/) bots within version control. [I recommend reading the introductory blog post](https://interbolt/blog/chatbotkit-sync-tool/), which includes a tutorial in the second half to help get you started.

## Motivation

Nothing against ChatBotKit's UI, but I don't like managing important things like my AI chatbot's state through any type of UI, no matter its design. This repo implements a filesystem API to manage a bot's skills, dataset files, and prompt overrides so that any changes to a bot's behavior are auditable within VC history.

## NPM Scripts

### `npm run create-bot-template [bot-name]`

Generates hello-world starter files and folders within the `bots/[bot-name]/` directory. See the [filesystem API](#filesystem-api) below for details.

### `npm run sync-bots`

Determines whether or not a bot defined within the repo needs to be created or updated, and then makes the appropriate API requests to do so. Running this for the first time will create any new bots found within the repo's `bots/*` folder and generate a `bots/<bot>/deployment.json` file for each one, which tells subsequent executions of the script to update, rather than create, the bot.

## Filesystem API

Every file that defines our bot lives in a subdirectory of the `bots` folder likeso: `bots/<bot>/*`. Let's review each file and folder within a new bot's generated directory:

### `dataset/`

Stores `txt` files that can exceed GPT-4's context window. Kind of like a chatbot's knowledge-base.

### `variables.ts`

A TypeScript file that exports a single function whose return object defines all the variables we might want to use in our `txt` files. _Every_ `txt` file in a bot's directory is processed as a lodash template and can use these variables likeso: `<%- MY_VARIABLE_FROM_VARIABLE_TS %>`. _Even dataset files can use these variables_.

### `abilities/`

Contains subdirectories, each of which represents an [ability](https://chatbotkit.com/docs/skillsets). Each ability directory contains a `description.txt` file and an `instruction.txt` file. These files serve the exact same purpose as the instruction and description text inputs in the ChatBotKit skillset UI. ([official docs](https://chatbotkit.com/tutorials/how-to-use-chatbot-skillsets-to-create-a-weather-forcast-bot))

### `identity/backstory.txt`

A kind of prompt context on steroids ([official docs](https://chatbotkit.com/docs/backstories))

### `identity/matched.txt`

Guides the bot's response when a user query matches content in the bot's dataset ([official docs](https://chatbotkit.com/docs/datasets))

### `identity/mismatched.txt`

Guides the bot's response when a user query does not match any content in the bot's dataset ([official docs](https://chatbotkit.com/docs/datasets))

### `deployment.json`

A programmatically generated and maintained file that tells `npm run sync-bots` that a bot in our filesystem was already created within [ChatBotKit](https://chatbotkit.com).

## Roadmap

As of now, I don't have plans to turn this into an NPM package. I just wanted to share because I thought it was useful. If you'd like me to continue working on it, consider mentioning me ([@interbolt_colin](https://twitter.com/interbolt_colin)) in a tweet along with a link to [this blog post](https://interbolt/blog/chatbotkit-sync-tool/) and a feature request.
