---
title: "A not-so-static React site using Cloudflare Page Functions"
description: "I discuss how to inject dynamic data into a static HTML file using a Cloudflare Page Function."
tags: React, NextJS, Cloudflare, Tutorial
datePublished: 2023-11-02T00:00:00.000Z
author: "Colin Campbell"
authorDescription: "InterBolt Founder"
published: true
---

[Cloudflare Page Functions](https://developers.cloudflare.com/pages/platform/functions/) are kind of amazing... when they're [working](https://news.ycombinator.com/item?id=38112515) at least.

Downtime concerns aside, I have a soft spot for the elegance and DX of [Cloudflare Workers](https://workers.cloudflare.com/). In this post, I'll outline some [code I pushed to Github](https://github.com/InterBolt/cloudflare-page-data-hook) that demonstrates how to inject dynamic data into a static website and access it via a type-safe React hook.

<aside class="callout callout-info callout-last">
📚 If you're interested in using a Cloudflare Page Function to serve a different build based on user-agent strings, check out <a href="/blog/split-it-and-forget-it/#tutorial-start">my other article.</a>
</aside>

## Inject the data

The goal: write a [Cloudflare Page Function](https://developers.cloudflare.com/pages/platform/functions/) that injects data into requested HTML files via a script tag. Within the [linked repo](https://github.com/InterBolt/cloudflare-page-data-hook), we have a file, `functions/[[catchAll]].ts`, that intercepts every single static asset request:

<aside class="callout callout-warning">
<strong>Do not skip over the code comments, that's where the meat of the information in this post comes from.</strong>
</aside>

```typescript
// functions/[[catchAll]].ts

// `api/index.ts` is shared between this Cloudflare Page Function
// and our frontend (React/NextJS). But we ONLY call functions defined within
// `api/index.ts` from this file. Our NextJS code will use `api/index.ts` as a
// glorified d.ts file 😬. Not perfect, but it compiles, works, and adds very
// little to our React bundle size.
import * as api from "../api";

// `constants.ts` is another file that we'll need to share with our
// frontend code.
import { WINDOW_ACCESS_KEY } from "../constants";

// Cloudflare doesn't include the .html extension in the url
// so this returns true if the url ends in a slash or a page
// name without an extension.
const isHTMLFile = (cloudflareUrl: string) => {
  return cloudflareUrl.split("/").at(-1).split(".").length === 1;
};

// Grabs the data from all the api requests and returns an object
// where the keys are the api request names and the values
// are their corresponding responses.
// Example return: { getProfile: { ...data }, getPosts: [ ...data ] }
const getApiData = async (params: Record<string, any>) => {
  const data = await Promise.all(
    Object.values(api).map((fn: any) => fn(params) as any)
  ).then((values) =>
    Object.keys(api).reduce(
      (acc, key, index) => ({ ...acc, [key]: values[index] }),
      {}
    )
  );

  return data;
};

// Injects a script tag with the api data into the head of our html file.
// Docs: https://developers.cloudflare.com/workers/runtime-apis/html-rewriter#element
const injectDataViaScriptTag = async (element: Element, href: string) => {
  // Convert the request href into a plain object
  const params = Object.fromEntries(new URL(href).searchParams);
  // Call the function that grabs all of the data we need to inject
  const data = await getApiData(params);

  // Inject the data by attaching a script tag which runs some JS
  // on the client to store the api response in the window object.
  element.after(
    `<script>
        window["${WINDOW_ACCESS_KEY}"] = ${JSON.stringify(data)};
      </script>`,
    { html: true }
  );
};

// The main function that runs on every asset request.
// Docs: https://developers.cloudflare.com/pages/platform/functions/get-started/#create-a-function
export const onRequest: PagesFunction = async ({ next, request }) => {
  // `onRequest` will run on each and every static asset request.
  // But we wouldn't inject script tags into non-HTML files so return
  // early for non-HTML files.
  if (!isHTMLFile(request.url)) {
    return next(request);
  }

  // Grab the HTML from cloudflare's cache
  const htmlResponse = await next(request);

  // Use HTMLRewriter to inject our script tag into the HTML's
  // head section.
  // Docs: https://developers.cloudflare.com/workers/runtime-apis/html-rewriter
  const htmlResponseWithApiData = new HTMLRewriter()
    .on("head", {
      element: (element: Element) =>
        injectDataViaScriptTag(element, request.url),
    })
    .transform(htmlResponse);

  // For safety, we always assume the data returned by
  // `getApiData` has changed and avoid a 304 response.
  // A 304 status tells the browser to use the version
  // of the page in its local cache, which could contain
  // stale data.
  return new Response(htmlResponseWithApiData.body, {
    ...htmlResponseWithApiData,
    status:
      htmlResponseWithApiData.status !== 304
        ? htmlResponseWithApiData.status
        : 200,
  });
};
```

Once the HTML file is loaded into the browser, a user can access the injected data by opening their browser console and logging the global window object (assuming JS is enabled).

Here's an outline of the functions inside of `api/index.ts`, which are imported in the code above:

```typescript
// api/index.ts

type TProfile = {
  // type properties...
};

type TPost = {
  // type properties...
};

export const getPosts = async (): Promise<Array<TPost>> => {
  // request to remote server/db...
};

export const getProfile = async (params: { id: string }): Promise<TProfile> => {
  // request to remote server/db...
};
```

And `constants.ts`, where we import `WINDOW_ACCESS_KEY` from:

```typescript
// constants.ts

export const WINDOW_ACCESS_KEY = "CLOUDFLARE_INJECTED_DATA";
```

I could end the article here and leave the strategy for accessing the injected data up to our reader, but that's no fun. Let's use the `constants.ts` and `api/index.ts` files to write a React hook to access the injected data.

## Writing a React hook: **useCloudflareInjected**

<aside class="callout callout-info">
💡 FYI: the cloudflare page function above would work on any static website.
</aside>

Since I focus on NextJS development, I'm going to use React within a NextJS project to generate our static website. In this article's [associated demo repo](https://github.com/InterBolt/cloudflare-page-data-hook), I used [NextJS's static export](/blog/split-it-and-forget-it/#prerequisite-nextjs-static-export) feature to produce a set of assets that can be hosted on Cloudflare Pages.

### Sharing code to achieve type-safety

Let's review our React hook, `useCloudflareInjected`, which will provide type-safe access to the data we attached to the window object in our Cloudflare page function:

```typescript
// src/useCloudflareInjected.ts

// This is that shared `api/index.ts` file we used in
// our cloudflare page function.
import * as api from "@/api";
// This is also shared with the cloudflare page function
import { WINDOW_ACCESS_KEY } from "@/constants";
import { useEffect, useState } from "react";

// This line is the entire reason we share the `api/index.ts` file
// between the cloudflare page function and this file.
// We'll use this inferred type to build a typesafe hook below.
type TApi = typeof api;

// This type will ensure that the return type of `useCloudflareInjected`
// depends on the `key` param provided. So for example, when the
// `key` param is "getProfile", the return type of this hook will
// be either `null` or the return type of the resolved
// `api.getProfile` function.
// Docs: https://www.typescriptlang.org/docs/handbook/2/generics.html
type TUseCloudflareHook = <TSuppliedApiRequestName extends keyof TApi>(
  key: TSuppliedApiRequestName
) => Awaited<ReturnType<TApi[TSuppliedApiRequestName]>> | null;

// A helper function to account for calling `useCloudflareInjected`
// on the server, where the `window` object does not exist yet.
const getInjectedData = (key: keyof TApi) => {
  if (typeof window !== "undefined") {
    return (window as any)?.[WINDOW_ACCESS_KEY]?.[key] || null;
  }
  return null;
};

// Even when `useCloudflareInjected` is called in components
// that include a "use client" directive, the first render
// will still happen at request or build time, which means
// the window object will not exist. So for a split second,
// just before our component calling this hook mounts, we
// expect `data` to equal `null`. Typescript should prevent
// us from making dumb mistakes since `TUseCloudflareHook`'s
// return type accounts for the possible `null` value.
// If, on the other hand, `useCloudflareInjected` is called
// within a component imported via `next/dynamic`, we'll get a
// non-null value on the first render.
//
// Doesn't make sense? Read this to better understand "use client":
// https://nextjs.org/docs/app/building-your-application/rendering/
//
// And read this to better understand `next/dynamic`:
// https://nextjs.org/docs/app/building-your-application/optimizing/lazy-loading#nextdynamic
const useCloudflareInjected: TUseCloudflareHook = (key) => {
  const [data, setData] = useState(getInjectedData(key));

  useEffect(() => {
    if (!data) {
      setData(getInjectedData(key));
    }
  }, []);

  return data;
};

export default useCloudflareInjected;
```

And here's how we would use our new React hook:

```tsx
// src/ClientComponent.tsx

// This directive is required since `useCloudflareInjected` calls `useState`.
// Docs: https://nextjs.org/docs/app/building-your-application/rendering/client-components
"use client";

// The code we just wrote above ⬆️
import useCloudflareInjected from "@/src/useCloudflareInjected";
import React from "react";

const ClientComponent = () => {
  // ❌ Won't compile because `api.nonexistent` does not exist.
  const dataThatWontExist = useCloudflareInjected("nonexistent");
  // ✅  Will compile because `api.getPosts` exists.
  const posts = useCloudflareInjected("getPosts");

  // ❌ Won't compile because `posts` could be `null`.
  return (
    <div>
      {posts.map((post, i) => (
        <p key={`post-text-${i}`}>{post.text}</p>
      ))}
    </div>
  );

  // ✅ Will compile because when `posts` is `null`, we
  // fallback to an empty array.
  return (
    <div>
      {(posts || []).map((post, i) => (
        <p key={`post-text-${i}`}>{post.text}</p>
      ))}
    </div>
  );
};

export default ClientComponent;
```

That covers the core logic! Now it's time to run the code locally. 👟

## Run locally with wrangler

<aside class="callout callout-warning">
⚠️ I'm using <a href="https://nodejs.org/en/download">Node version 18</a> and <a href="https://yarnpkg.com/">Yarn version 1</a>. I would expect any Node version greater than 16 to work but I won't make promises.
</aside>

The code for this article is located in the following Github repo: [https://github.com/InterBolt/cloudflare-page-data-hook](https://github.com/InterBolt/cloudflare-page-data-hook). If you aren't familiar with wrangler, the CLI tool used to run cloudflare workers locally, please [read the docs](https://developers.cloudflare.com/workers/wrangler/) before continuing.

Run the below commands in your terminal to clone the repo, install dependencies, build a static website, and serve it on your local network.

```shell
git clone https://github.com/InterBolt/cloudflare-page-data-hook.git
cd cloudflare-page-data-hook
yarn
yarn build
yarn wrangler
```

If everything worked you should see the following terminal output:

<div class="img-container">
  <img loading="lazy" src="/images/blog/use-cloudflare-hook/screenshots/wrangler-output.webp"/>
</div>

Open one of the http urls in your browser and you should see a screen like this:

<div class="img-container">
  <img loading="lazy" src="/images/blog/use-cloudflare-hook/screenshots/demo-screen.webp"/>
</div>

And that's it! You now have some working code to experiment with. Feel free to fork the repo and tweet at me with any ideas you come up with. I'd love to see what you come up with.

## Tradeoffs

This technique has some obvious downsides when compared to a pure client-side/react-query approach:

- **The slowest link problem**: each HTML request is as slow as the slowest api request, since we need all the api requests to fulfill before sending the HTML file to the user.
- **The dreaded screen flicker**: aka - what do we render while we're waiting for our React components to mount client-side? Anyone who has written enough client-side React will recognize this problem, but usually in the context of client-triggered network requests. In our case, the flicker will never last longer than the time it takes for our React components to mount.
- **JS is required**: because the data we need lives in the `window` object, we won't see anything in the browser if the user does not have Javascript enabled.
- **More work is required for SEO**: similarly to how we injected a script tag for our api data, we would need to add more logic to inject metadata tags in our HTML head so that search engines could crawl our dynamic content.

In summary, I'd hesitate to go all in on this data loading strategy, but I see an interesting case for a few things like the following:

- **user-agent based feature flags**: when you don't want a fully fledged backend, you can use this technique to toggle features in your static website.
- **Initialize react-query with pre-populated data**: see [https://tanstack.com/query/v4/docs/react/guides/initial-query-data](https://tanstack.com/query/v4/docs/react/guides/initial-query-data). Here's how the code to do that might look:

  ```typescript
  // Source: https://tanstack.com/query/v4/docs/react/guides/initial-query-data

  const result = useQuery({
    queryKey: ["someData"],
    queryFn: () => fetch("/some-data"),
    // We would use the pre-fetched data here :)
    initialData: window[WINDOW_ACCESS_KEY].someData,
  });
  ```

## Conclusion

In this article, I walked through some code to enable injecting dynamic data into an otherwise static HTML website using Cloudflare Page Functions and NextJS. The solution I laid out was a simple proof of concept, and still leaves a few questions unanswered like:

- As we add pages, how do we call only a subset of our api functions on a given page? See the [follow up post](/blog/nextcast/) to this one for a solution to this.
- If a given page expects a particular set of search params, can we make those params type-safe on the frontend?

If you're still reading, I have faith that you're capable of experimenting with potential solutions. Even if the concept never comes up again in your professional career, I hope you had fun climbing down this rabbit hole with me.

`CTA:tweet`
