import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function blockThirdParties(page) {
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (["127.0.0.1", "localhost"].includes(url.hostname)) route.continue();
    else route.abort("blockedbyclient");
  });
}

async function videosArePaused(page) {
  return page.locator('video[aria-hidden="true"]').evaluateAll((videos) => videos.every((video) => video.paused));
}

async function videoIsPaused(page, id) {
  return page.locator(`#${id}`).evaluate((video) => video.paused);
}

async function centerMotionRegion(page, id) {
  await page.locator(`#${id}`).evaluate((video) => {
    video.closest("[data-motion-region]").scrollIntoView({ block: "center", inline: "center" });
  });
  await page.waitForTimeout(100);
}

async function positionMotionRegionAtVerticalRatio(page, id, ratio) {
  await centerMotionRegion(page, id);
  await page.locator(`#${id}`).evaluate((video, visibleRatio) => {
    const region = video.closest("[data-motion-region]");
    const box = region.getBoundingClientRect();
    const desiredTop = -box.height * (1 - visibleRatio);
    window.scrollBy(0, box.top - desiredTop);
  }, ratio);
  await page.waitForTimeout(100);
}

async function expectSynchronizedMotionLabels(page, label) {
  const controls = page.locator(".motion-toggle");
  await expect(controls).toHaveCount(2);
  await expect(controls.nth(0)).toHaveAccessibleName(label);
  await expect(controls.nth(1)).toHaveAccessibleName(label);
}

async function waitForScrollToSettle(page) {
  await page.evaluate(() => new Promise((resolve) => {
    let previousX = window.scrollX;
    let previousY = window.scrollY;
    let stableFrames = 0;
    const deadline = performance.now() + 1_500;

    const check = () => {
      const currentX = window.scrollX;
      const currentY = window.scrollY;
      const didMove = Math.abs(currentX - previousX) > 0.5
        || Math.abs(currentY - previousY) > 0.5;
      stableFrames = didMove ? 0 : stableFrames + 1;
      previousX = currentX;
      previousY = currentY;

      if (stableFrames >= 5 || performance.now() >= deadline) resolve();
      else requestAnimationFrame(check);
    };

    requestAnimationFrame(check);
  }));
}

test.beforeEach(async ({ page }) => blockThirdParties(page));

test("homepage passes automated WCAG A/AA checks", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
});

test("decorative media stays out of the accessibility tree", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("img")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2, name: /selected work/i })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(7);
});

test("keyboard users can skip directly to the main content", async ({ page }) => {
  await page.goto("/");
  const skipLink = page.getByRole("link", { name: /skip to (?:main )?content/i });
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  const main = page.locator("#main-content");
  await expect(main).toBeFocused();
  expect(await main.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  expect(await main.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
});

test("pointer focus on the main content does not draw a page outline", async ({ page }) => {
  await page.goto("/");
  const main = page.locator("#main-content");
  const testimonials = page.locator(".testimonials-section");
  await testimonials.scrollIntoViewIfNeeded();
  const box = await testimonials.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(2, Math.min(page.viewportSize().height - 1, Math.max(1, box.y + 20)));
  expect(await main.evaluate((element) => element.matches(":focus-visible"))).toBe(false);
  expect(await main.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("none");
});

test("decorative loops use synchronized controls and only play in view", async ({ page }) => {
  await page.goto("/");
  const videos = page.locator('video[aria-hidden="true"]');
  await expect(videos).toHaveCount(2);
  expect(await videos.evaluateAll((items) => items.every((video) => !video.hasAttribute("autoplay")))).toBe(true);

  const controls = page.locator(".motion-toggle");
  await expect(controls).toHaveCount(2);
  for (const control of await controls.all()) {
    await expect(control).toBeVisible();
    const controlledIds = (await control.getAttribute("aria-controls"))?.trim().split(/\s+/) ?? [];
    expect(controlledIds).toEqual(["montage-motion", "ambient-motion"]);
    const box = await control.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }

  await centerMotionRegion(page, "montage-motion");
  await expect.poll(() => videoIsPaused(page, "montage-motion")).toBe(false);
  await expect.poll(() => videoIsPaused(page, "ambient-motion")).toBe(true);
  await expectSynchronizedMotionLabels(page, /^pause animations$/i);

  await positionMotionRegionAtVerticalRatio(page, "montage-motion", 0.45);
  await expect.poll(() => videoIsPaused(page, "montage-motion")).toBe(true);
  await expectSynchronizedMotionLabels(page, /^play animations$/i);

  await centerMotionRegion(page, "montage-motion");
  await expect.poll(() => videoIsPaused(page, "montage-motion")).toBe(false);
  await controls.nth(0).focus();
  await page.keyboard.press("Enter");
  await expectSynchronizedMotionLabels(page, /^play animations$/i);
  await expect.poll(() => videosArePaused(page)).toBe(true);

  await centerMotionRegion(page, "ambient-motion");
  await expect.poll(() => videosArePaused(page)).toBe(true);
  await expectSynchronizedMotionLabels(page, /^play animations$/i);

  await controls.nth(1).click();
  await expect.poll(() => videoIsPaused(page, "montage-motion")).toBe(true);
  await expect.poll(() => videoIsPaused(page, "ambient-motion")).toBe(false);
  await expectSynchronizedMotionLabels(page, /^pause animations$/i);

  await page.locator("#contact").scrollIntoViewIfNeeded();
  await expect.poll(() => videosArePaused(page)).toBe(true);
  await expectSynchronizedMotionLabels(page, /^play animations$/i);

  await centerMotionRegion(page, "montage-motion");
  await expect.poll(() => videoIsPaused(page, "montage-motion")).toBe(false);
  await expect.poll(() => videoIsPaused(page, "ambient-motion")).toBe(true);
});

test("hidden tabs pause motion and only resume when the user has not paused", async ({ page }) => {
  await page.goto("/");
  await centerMotionRegion(page, "montage-motion");
  await expect.poll(() => videoIsPaused(page, "montage-motion")).toBe(false);

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => videosArePaused(page)).toBe(true);

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => videoIsPaused(page, "montage-motion")).toBe(false);

  await page.locator(".motion-toggle").nth(0).click();
  await expect.poll(() => videosArePaused(page)).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => videosArePaused(page)).toBe(true);
});

test("reduced-motion visitors receive a still experience", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await blockThirdParties(page);
  await page.goto(baseURL);
  const controls = page.locator(".motion-toggle");
  await expect(controls).toHaveCount(2);
  await centerMotionRegion(page, "montage-motion");
  await expectSynchronizedMotionLabels(page, /^play animations$/i);
  await expect.poll(() => videosArePaused(page)).toBe(true);
  await controls.nth(0).press("Enter");
  await expectSynchronizedMotionLabels(page, /^pause animations$/i);
  await expect.poll(() => videoIsPaused(page, "montage-motion")).toBe(false);
  await expect.poll(() => videoIsPaused(page, "ambient-motion")).toBe(true);
  await centerMotionRegion(page, "ambient-motion");
  await expect.poll(() => videoIsPaused(page, "montage-motion")).toBe(true);
  await expect.poll(() => videoIsPaused(page, "ambient-motion")).toBe(false);
  await controls.nth(1).press("Enter");
  await expect.poll(() => videosArePaused(page)).toBe(true);
  await context.close();
});

test("an autoplay rejection leaves both loops still and the control accurate", async ({ page }) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException("Autoplay blocked", "NotAllowedError"));
  });
  await page.goto("/");
  await centerMotionRegion(page, "montage-motion");
  await expectSynchronizedMotionLabels(page, /^play animations$/i);
  await expect.poll(() => videosArePaused(page)).toBe(true);
});

test("the page remains still and usable without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await blockThirdParties(page);
  await page.goto(baseURL);
  const videos = page.locator('video[aria-hidden="true"]');
  await expect(videos).toHaveCount(2);
  expect(await videos.evaluateAll((items) => items.every((video) => !video.hasAttribute("autoplay")))).toBe(true);
  await expect.poll(() => videosArePaused(page)).toBe(true);
  await expect(page.locator(".motion-toggle")).toHaveCount(2);
  await expect(page.locator(".motion-toggle").nth(0)).toBeHidden();
  await expect(page.locator(".motion-toggle").nth(1)).toBeHidden();
  expect(await page.locator(".underline-text").first().evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  await expect(page.locator("#main-content")).toBeVisible();
  await expect(page.locator("#contact")).toBeVisible();
  await expect(page.getByRole("link", { name: /email|linkedin/i }).first()).toBeVisible();
  await context.close();
});

test("header, motion, testimonial, fallback, and social links follow keyboard order", async ({ page }) => {
  await page.goto("/");
  const expectedOrder = [
    page.getByRole("link", { name: /skip to (?:main )?content/i }),
    page.getByRole("link", { name: /bruno lucena, home/i }),
    page.getByRole("link", { name: /resume\/cv/i }),
    page.getByRole("link", { name: /^connect with me$/i }),
    page.getByRole("link", { name: /bruno lucena on dribbble/i }),
    page.getByRole("link", { name: /bruno lucena on linkedin/i }),
    page.getByRole("link", { name: /bruno lucena on github/i }),
    page.locator(".motion-toggle").nth(0),
    page.locator(".motion-toggle").nth(1),
    page.getByRole("link", { name: /jorge matos/i }),
    page.getByRole("link", { name: /marjolein kassenaar/i }),
    page.getByRole("link", { name: /sunita joshua/i }),
    page.getByRole("link", { name: /renato dubravkic/i }),
    page.getByRole("link", { name: /brian garson/i }),
    page.getByRole("link", { name: /barbara werneck/i }),
    page.getByRole("link", { name: /connect with me on linkedin/i })
  ];

  for (const element of expectedOrder) {
    await page.keyboard.press("Tab");
    await expect(element).toBeFocused();
    await waitForScrollToSettle(page);
    await expect.poll(() => element.evaluate((focused) => {
      const box = focused.getBoundingClientRect();
      return box.bottom > 0
        && box.right > 0
        && box.top < window.innerHeight
        && box.left < document.documentElement.clientWidth;
    }), { message: "The focused control should become visible in the viewport" }).toBe(true);
    const obscuredByHeader = await element.evaluate((focused) => {
      const box = focused.getBoundingClientRect();
      const header = document.querySelector(".site-header");
      const headerBox = header.getBoundingClientRect();
      return !focused.classList.contains("skip-link")
        && !header.contains(focused)
        && box.top < headerBox.bottom
        && box.bottom > headerBox.top;
    });
    expect(obscuredByHeader).toBe(false);
  }
});

test("initial local media stays within the two MiB budget", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("load");
  const bytes = await page.evaluate(() => performance.getEntriesByType("resource")
    .filter((entry) => /\.(?:avif|gif|jpe?g|mp4|png|svg|webm|webp)(?:[?#]|$)/i.test(entry.name)
      && new URL(entry.name).origin === location.origin)
    .reduce((total, entry) => total + (entry.transferSize || entry.encodedBodySize || 0), 0));
  expect(bytes, `Initial local media transferred ${(bytes / 1024 / 1024).toFixed(2)} MiB`).toBeLessThanOrEqual(2 * 1024 * 1024);
});

test("the layout reflows without horizontal page scrolling", async ({ page }) => {
  await page.goto("/");
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("the sticky header keeps the Contact target unobscured", async ({ page }) => {
  await page.goto("/");
  const header = page.locator(".site-header");
  await page.getByRole("link", { name: /^connect with me$/i }).click();
  await expect(page).toHaveURL(/#contact$/);
  await expect(header).toBeVisible();

  const positions = await page.evaluate(() => {
    const headerBox = document.querySelector(".site-header").getBoundingClientRect();
    const contactBox = document.querySelector("#contact").getBoundingClientRect();
    return { headerBottom: headerBox.bottom, headerTop: headerBox.top, contactTop: contactBox.top };
  });
  expect(Math.abs(positions.headerTop)).toBeLessThanOrEqual(1);
  expect(positions.contactTop).toBeGreaterThanOrEqual(positions.headerBottom);
});

test("the header gains its scrolled treatment at 400 pixels", async ({ page }) => {
  await page.goto("/");
  const header = page.locator(".site-header");
  await expect(header).not.toHaveClass(/\bscrolled\b/);

  await page.evaluate(() => window.scrollTo(0, 399));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(399);
  await expect(header).not.toHaveClass(/\bscrolled\b/);

  await page.evaluate(() => window.scrollTo(0, 400));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(400);
  await expect(header).toHaveClass(/\bscrolled\b/);
});

test("the layout tolerates WCAG text-spacing overrides", async ({ page }) => {
  await page.goto("/");
  await page.addStyleTag({ content: `
    * {
      line-height: 1.5 !important;
      letter-spacing: 0.12em !important;
      word-spacing: 0.16em !important;
    }
    p { margin-bottom: 2em !important; }
  ` });
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("forced-colors mode retains a visible keyboard focus indicator", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/");
  expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: /skip to (?:main )?content/i });
  await expect(skipLink).toBeFocused();
  expect(await skipLink.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
});

test("public metadata exposes only the homepage and a deployed social image", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://brunlucen.github.io/");

  const socialImage = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(socialImage).toBeTruthy();
  const socialImageUrl = new URL(socialImage);
  expect(socialImageUrl.origin).toBe("https://brunlucen.github.io");
  expect((await request.get(socialImageUrl.pathname)).ok()).toBe(true);

  const sitemapResponse = await request.get("/sitemap.xml");
  expect(sitemapResponse.ok()).toBe(true);
  const sitemap = await sitemapResponse.text();
  expect(sitemap.match(/<url>/g) ?? []).toHaveLength(1);
  expect(sitemap).toContain("<loc>https://brunlucen.github.io/</loc>");
});

test("source and dist serve identical styles, local fonts, and representative computed styles", async ({ page, request }) => {
  const distOrigin = "http://127.0.0.1:4173";
  const sourceOrigin = "http://127.0.0.1:4174";
  const cssPath = "/assets/css/style.css";
  const fontPaths = [
    "/assets/fonts/bricolage-grotesque-latin-wght-normal.woff2",
    "/assets/fonts/ibm-plex-sans-latin-wght-normal.woff2"
  ];

  const [distCss, sourceCss] = await Promise.all([
    request.get(`${distOrigin}${cssPath}`),
    request.get(`${sourceOrigin}${cssPath}`)
  ]);
  expect(distCss.ok()).toBe(true);
  expect(sourceCss.ok()).toBe(true);
  expect(distCss.headers()["content-type"]).toMatch(/^text\/css\b/i);
  expect(sourceCss.headers()["content-type"]).toMatch(/^text\/css\b/i);
  const [distCssBytes, sourceCssBytes] = await Promise.all([distCss.body(), sourceCss.body()]);
  expect(distCssBytes.equals(sourceCssBytes), "dist CSS must be copied byte-for-byte from the tracked root CSS").toBe(true);

  for (const fontPath of fontPaths) {
    const [distFont, sourceFont] = await Promise.all([
      request.get(`${distOrigin}${fontPath}`),
      request.get(`${sourceOrigin}${fontPath}`)
    ]);
    expect(distFont.ok()).toBe(true);
    expect(sourceFont.ok()).toBe(true);
    expect(distFont.headers()["content-type"]).toMatch(/^font\/woff2\b/i);
    expect(sourceFont.headers()["content-type"]).toMatch(/^font\/woff2\b/i);
    const [distFontBytes, sourceFontBytes] = await Promise.all([distFont.body(), sourceFont.body()]);
    expect(distFontBytes.equals(sourceFontBytes), `${fontPath} must match in source and dist`).toBe(true);
  }

  const computedStyleSnapshot = async (origin) => {
    await page.goto(origin);
    await page.evaluate(() => document.fonts.ready);
    return page.evaluate(() => {
      const styleOf = (selector) => getComputedStyle(document.querySelector(selector));
      const body = styleOf("body");
      const header = styleOf(".site-header");
      const heading = styleOf(".hero h1");
      const montage = styleOf(".montage-grid");
      const contact = styleOf(".contact-section");
      const motionControl = styleOf(".motion-toggle");
      return {
        body: [body.backgroundColor, body.color, body.fontFamily],
        header: [header.position, header.height, header.backgroundColor],
        heading: [heading.fontFamily, heading.fontSize, heading.fontWeight, heading.lineHeight],
        montage: [montage.display, montage.gap, montage.height],
        contact: [contact.backgroundColor, contact.paddingTop, contact.paddingBottom],
        motionControl: [motionControl.position, motionControl.width, motionControl.height]
      };
    });
  };

  const distStyles = await computedStyleSnapshot(distOrigin);
  const sourceStyles = await computedStyleSnapshot(sourceOrigin);
  expect(sourceStyles).toEqual(distStyles);
});

test("the production visual geometry stays locked at approved breakpoints", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "One cross-viewport geometry pass is sufficient");

  const cases = [
    { width: 2048, height: 1080, header: 68, heading: 56, container: 1200, tile: 400, wideTile: 600 },
    { width: 1440, height: 900, header: 68, heading: 40, container: 1200, tile: 400, wideTile: 400 },
    { width: 1024, height: 1366, header: 68, heading: 40, container: 1024, tile: 400, wideTile: 300 },
    { width: 390, height: 844, header: 112, heading: 32, container: 390, tile: 300, wideTile: 300 },
    { width: 320, height: 800, header: 112, heading: 32, container: 320, tile: 300, wideTile: 300 }
  ];

  for (const expected of cases) {
    await page.setViewportSize({ width: expected.width, height: expected.height });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const geometry = await page.evaluate(() => {
      const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
      const headingStyle = getComputedStyle(document.querySelector(".hero h1"));
      const montageStyle = getComputedStyle(document.querySelector(".montage-grid"));
      return {
        header: rect(".site-header").height,
        hero: rect(".hero").height,
        heading: Number.parseFloat(headingStyle.fontSize),
        container: rect(".hero .container").width,
        tile: rect(".montage-item").height,
        wideTile: rect(".montage-item-wide").width,
        gap: Number.parseFloat(montageStyle.gap),
        pageClientWidth: document.documentElement.clientWidth,
        pageScrollWidth: document.documentElement.scrollWidth,
        montageClientWidth: document.querySelector(".montage-grid").clientWidth,
        montageScrollWidth: document.querySelector(".montage-grid").scrollWidth
      };
    });

    expect(geometry.header).toBeCloseTo(expected.header, 0);
    expect(geometry.heading).toBeCloseTo(expected.heading, 0);
    expect(geometry.container).toBeCloseTo(expected.container, 0);
    expect(geometry.tile).toBeCloseTo(expected.tile, 0);
    expect(geometry.wideTile).toBeCloseTo(expected.wideTile, 0);
    expect(geometry.gap).toBeCloseTo(16, 0);
    expect(geometry.pageScrollWidth).toBeLessThanOrEqual(geometry.pageClientWidth);

    if (expected.width >= 1024) {
      expect(geometry.hero).toBeCloseTo(expected.height * 0.75, 0);
    } else {
      expect(geometry.montageScrollWidth).toBeGreaterThan(geometry.montageClientWidth);
    }
  }
});

test("mobile LCP and CLS stay within good-experience thresholds", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-mobile-320", "Mobile performance budget");
  await page.addInitScript(() => {
    window.__portfolioMetrics = { cls: 0, lcp: 0 };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__portfolioMetrics.cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      window.__portfolioMetrics.lcp = entries.at(-1)?.startTime ?? window.__portfolioMetrics.lcp;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  const metrics = await page.evaluate(() => window.__portfolioMetrics);
  expect(metrics.lcp, "No Largest Contentful Paint entry was recorded").toBeGreaterThan(0);
  expect(metrics.lcp, `LCP was ${metrics.lcp.toFixed(0)} ms`).toBeLessThanOrEqual(2500);
  expect(metrics.cls, `CLS was ${metrics.cls.toFixed(3)}`).toBeLessThanOrEqual(0.1);
});

test("legacy and unknown routes return the accessible 404 page", async ({ page }) => {
  for (const route of ["/about.html", "/projeto.html", "/not-a-real-page"]) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: /page not found/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /return home/i })).toBeVisible();
  }
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
});
