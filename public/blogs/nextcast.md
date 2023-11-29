---
title: "Static analysis and meta programming in NextJS"
description: "An introduction to NextCast, a build tool that makes static analysis and source code manipulation accessible to NextJS developers through an intuitive plugin-based API."
tags: NextJS
datePublished: 2023-11-19T00:00:00.000Z
author: "Colin Campbell"
authorDescription: "InterBolt Founder"
published: true
---

## What is [NextCast](https://github.com/interbolt/nextcast)?

<aside class="callout">
📚 If you're short on time, skip to the repo's readme: <a href="https://github.com/interbolt/nextcast#readme">github.com/interbolt/nextcast</a>
</aside>

**NextCast** is a plugin system that reduces the friction involved with doing **static analysis and metaprogramming** within NextJS applications. It's built on top of [Webpack](https://webpack.js.org), [BabelJS](https://babeljs.io/), [Jscodeshift](https://github.com/facebook/jscodeshift), and [ESLint](https://eslint.org/).

A plugin can collect static information about source code, generate helpful artifacts like JSON files and TypeScript interfaces, pipe domain-driven errors and warnings into ESLint, and rewrite code ([webpack loader style](https://webpack.js.org/contribute/writing-a-loader/#guidelines)) during the build process. Plugins define their logic within three different phases:

- **Collector phase (sync, series)**: Collect information about [NextJS](https://nextjs.org) source code via static analysis. Used for accummulating data based on babel traversals. Each plugin's collector runs in the order the plugins were defined, making it easy for plugin authors to leverage collected data from a "base" plugin, third party or their own.

- **Builder phase (async, parallel)**: Uses the data collected in the collector phase in combination with any number of possible internal or external data sources to produce useful information to lend our rewrite logic. Each plugin's builder phase will run in parallel.

- **Rewriter phase (async, series)**: Uses gathered information and artifacts to queue rewrites. Each plugin's rewriter must await the previously defined plugin's rewriter to run, which means plugin authors should only use async code for things like filesystem access.

### What problem does NextCast solve?

**NextCast** enables NextJS specific "meta-frameworks". JS frameworks often make use of a build tool like Webpack or a custom compiler like Svelte's to introduce magical properties, such as syntax or filesystem rules. To make these magical properites usable, frameworks package eslint plugins and rules so that errors are revealed before a build or compile step runs. **NextCast** is like a heavily watered-down and opinionated combination of webpack's loader system and eslint's custom rule api that only works for NextJS. I'm dog fooding it as I build a new "meta-framework" on top of [NextJS's SSG feature](https://nextjs.org/docs/app/building-your-application/deploying/static-exports) and [Cloudflare Page Functions](https://developers.cloudflare.com/pages/platform/functions/get-started/). [Follow me on twitter](https://twitter.com/interbolt_colin) for an announcement of its launch.

### Reporting linter errors and warnings

During any phase, plugin authors can call a function to report errors or warnings as they detect them. These errors are automatically piped into ESLint when `eslint-plugin-nextcast` is installed and configured. _Note: for NPM >= 7 users, `eslint-plugin-nextcast` is automatically installed via `npm i -D nextcast`_.

### Documentation

I'm leaving the API specifics out of this post. Please refer to the [official readme](https://github.com/interbolt/nextcast#readme) for more info. And give it a star if you think its useful 🌟. If you're interested in a deeper dive where I outline the problem I was trying to solve and how it led to the creation of **NextCast**, continue reading. Otherwise, [connect with me on Twitter](https://twitter.com/interbolt_colin) if you have questions.

## The problem that led to NextCast

For more context, feel free to read [my last post about injecting dynamic data into a static website](/blog/introducing-interbolt/). But for now, I'll jump to the relevant section where I created the following React hook:

```tsx
const somePreloadedData = usePreloadedData("some_preloaded_data");
```

In the code above, `usePreloadedData` implements client-side access to data injected at the ["edge"](https://developers.cloudflare.com/workers/). The point of the hook was to encapsulate the process of grabbing the correct data from the HTML, as well as to provide some type information so that I wouldn't try to access data that wasn't there. The [original post](/blog/introducing-interbolt/) linked to a working [Github repo](https://github.com/InterBolt/cloudflare-page-data-hook) if you're interested.

But as the amount of dynamic data I needed across all of my pages grew, my naive experimental code didn't include a means to selectively load a subset of the data on smaller pages.

### The naive approach

For most websites, I would probably create a simple JSON manifest file, lets call it `PreloadManifest`, which would map route names to data sources that we want to preload for the given route. `PreloadManifest`'s type signature would look something like this:

```typescript
type RouteName = string;
type DataSource = string;
type PreloadManifest = Record<RouteName, Array<DataSource>>;
```

When an HTML file is requested for a given route, the Cloudflare Page Function could figure out which types of data it needs to preload by looking up the array of `DataSource` strings associated with the route, make the appropriate requests, and inject the responses into the HTML's head. Problem solved.

### It breaks an aspect of React component encapsulation

One of the nice aspects of writing React components is that we can encapsulate and re-use logic across screens. A common debate amongst React developers is whether or not components should dictate the types of dynamic data they need, or whether they should explicitly subscribe to data sources declared higher up in an app's render tree. Until I had experience working with [React Query](https://tanstack.com/query/v3/), I fell into the later camp more often than not. But with [React Query](https://tanstack.com/query/v3/) and similar libraries, it makes sense to encapsulate api requests within an individual component, since the cache and lifecycle state for a given api request is accessible across the entire render tree. With [React Query](https://tanstack.com/query/v3/), we can call the same data fetching hook any number of times across multiple components on a page and know that our request will only fire once. Encapsulation has almost no downsides here.

But if we rely on the `PreloadManifest` file to know which routes load which pieces of data, components need an awareness of where they're rendered, so that they don't accidentally try to access non-existent data via `usePreloadedData`.

### A visualization of the problem

In the following visual, imagine each purple box is a [NextJS](https://nextjs.org) route and each blue box is an arbitrary React component that needs access to some preloaded data. To keep it simple, each component in the visualized tree makes a single call to `usePreloadedData('data_{A,B,A,...}')`. Here's the challenge: track down all the data that a particular route requires and produce a `PreloadManifest` file:

<div class="img-container">
  <img loading="lazy" src="/images/blog/nextcast/screenshots/tree-chart.webp"/>
</div>

Here's what I came up with:

```json
{
  "/page-one": [
    "data_A",
    "data_P",
    "data_F",
    "data_B",
    "data_E",
    "data_C",
    "data_Z"
  ],
  "/page-two": ["data_B", "data_E", "data_F", "data_C", "data_A", "data_D"],
  "/page-three": ["data_B", "data_E", "data_F", "data_C", "data_A", "data_D"],
  "/page-four": ["data_A", "data_P", "data_F", "data_B", "data_D"]
}
```

Now imagine an app with 10s (or 100s) of components spread across many different routes. The manual process of tracking down `usePreloadedData` calls is not a scalable solution to the problem.

### Automate the creation of the PreloadManifest file

One possible solution: programmatically crawl the source code of our NextJS app, and list all uses of `usePreloadedData`. Then maybe we could inspect each call's param and infer the types of data that a given route needs, making the creation of a `PreloadManifest` file straighforward. But, as I mentioned before, [NextJS](https://nextjs.org)'s file-based routing system means we probably need to crawl more than one entry file per route. Take the following [NextJS](https://nextjs.org) app router folder structure:

```shell
app
├── about
│   ├── team
│   │   └── page.tsx
│   ├── layout.tsx
│   ├── page.tsx
├── dashboard
│   ├── (user)
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── admin
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── layout.tsx
│   └── page.tsx
├── layout.tsx
└── page.tsx
```

If we want to know which files contribute code to the final build output for the `/dashboard/admin/` route, we have to understand a little bit about how [NextJS](https://nextjs.org) nests layout files. With some exceptions, [NextJS](https://nextjs.org) will nest each directory's layout and page file within the layout file of the parent folder. With that knowledge, let's strip away all the files from the above folder structure that do NOT contribute code to the `/dashboard/admin/` route and look at what's left:

```shell
app
├── dashboard
│   ├── admin
│   │   ├── layout.tsx
│   │   └── page.tsx
│   └── layout.tsx
└── layout.tsx
```

Here lie the four entry files whose source code that we'll need to crawl:

- `app/dashboard/admin/page.tsx`
- `app/dashboard/admin/layout.tsx`
- `app/dashboard/layout.tsx`
- `app/layout.tsx`.

Simple enough in the contrived case, but what about NextJS's `template.tsx` files, or intercepting routes, or route groups, etc. Not only do we need a way to crawl our source code to find all uses of `usePreloadedData`, but we also need a way to automatically inspect a [NextJS](https://nextjs.org) app directory and determine which files contribute code to each particular page based on the rules laid out in the [NextJS](https://nextjs.org) [routing documentation](https://nextjs.org/docs/app/building-your-application/routing).

And if that isn't complicated enough, there's another problem. What happens if a developer on the team gets clever and wraps `usePreloadedData` within another hook likeso:

```tsx
const useCleverDataAccess = (dataField: UsePreloadedDataType) => {
  // developer's code
  // ...
  // ...
  const data = usePreloadedData(dataField);

  return {
    // developer's code
    // ...
    // ...
    data,
  };
};
```

Now the task of crawling the source code gets really complicated. We not only need to find calls to `usePreloadedData`, but we also need to find calls to `useCleverDataAccess`, since the wrapped version of `usePreloadedData(dataField)` doesn't use a string literal type as its param anymore, meaning we can't infer the type of data we're requesting unless we find the `useCleverDataAccess` calls. And what if someone decides to wrap `useCleverDataAccess`, and so on and so forth 🤯. At minimum we would need to combine any solution with a linter rule to prevent calling `usePreloadedData` with any non-string literal argument.

In summary, to generate a `PreloadManifest` file from our [NextJS](https://nextjs.org) source code, we need:

1. A function to determine all of the entry files for a given route based on the [NextJS](https://nextjs.org) app router conventions.
2. A way to recursively crawl each entry file's imports and search the code for calls to `usePreloadedData`.
3. A linter rule to prevent calling the `usePreloadedData` hook with non-string literal types.

Long story short: I spent way too much time creating these three pieces of required functionality, and after some twists and turns, the result was my first **NextCast** plugin.

## Plugin code

I recommend reviewing the **NextCast** plugin that solves the problem of generating our `PreloadManifest` file in the following repo: [github.com/interbolt/nextcast-demo](https://github.com/InterBolt/nextcast-demo). The code is heavily commented and the demo repo's README points out all the relevant files that make the plugin work. Clone it likeso:

```shell
git clone https://github.com/interbolt/nextcast-demo.git && cd nextcast-demo
```

If you just want a high level overview of how it works, here's a brief description of each phase that the plugin defines:

- **The collector phase**: In this phase, we use **NextCast**'s api to loop through all the files that contribute code to a given route and save every use of `usePreloadedData` that we find. If we find a use of `usePreloadedData` where its first param is not a string literal, we report an error.

- **The builder phase**: In this phase, we convert the collected information about `usePreloadedData` calls and generate a JSON representation of our final `PreloadManifest` file.

- **The rewriter phase**: And finally, in this phase we use a template string to create the final `PreloadManifest` Typescript file and add it to our source code using the `Api.dangerouslyQueueRewrite` function.

Any errors reported will cause the NextJS build to fail and ESLint errors like the following to show up:

<div class="img-container">
  <img loading="lazy" src="/images/blog/nextcast/screenshots/demo-eslint.webp"/>
</div>

## Conclusion

With the above plugin, we can now write `usePreloadedData` hooks within any component we want and we won't need to manually keeping track of the data that the route needs. Our new **NextCast** plugin builds a `PreloadManifest` file that our Cloudflare Page Function can use to load the correct data before the page is rendered. Data fetching encapsulation at the component level is back on the menu.

I really hope that you enjoyed the article and that you follow along with **NextCast**'s development. The library is still in alpha development, so the API is subject to change.

I try to write these types of articles once every week or two. If you're interested in reading more about **NextCast**, or some other rabbit hole I wander down, [follow me on twitter](https://twitter.com/interbolt_colin).

`CTA:tweet`
