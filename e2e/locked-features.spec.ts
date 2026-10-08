import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { interceptApi, makeTaskId, seedTaskCache, taskIdWithTitle, TRANSCRIPT, VIDEO } from "./fixtures";

/**
 * 前端功能锁定 E2E（纯前端形态）。
 *
 * 全部 /api/* 由 Playwright route interception 提供 fixture（Mock 层已删除，
 * 见 docs/MIGRATION.md §2）。直链访问结果页的用例先 seedTaskCache 种入本地缓存。
 * 时间戳断言一律通过 data-testid 限定在全文正文 / 时间戳列表区域内，避免整页误报。
 */

const TIMESTAMP_PATTERN = /\d{1,2}:\d{2}(?::\d{2})?/;

test.describe("前端功能锁定协议", () => {
  test("锁定 1：结果页默认全文阅读，正文零时间戳，可切换时间戳定位", async ({ page }) => {
    await interceptApi(page);
    const taskId = await seedTaskCache(page);
    await page.goto(`/result/${taskId}`);

    // 默认激活「全文阅读」Tab，正文区域可见
    const articleTab = page.getByRole("tab", { name: "全文阅读" });
    await expect(articleTab).toBeVisible();
    await expect(articleTab).toHaveAttribute("aria-selected", "true");

    // 断言严格限定在 data-testid=fulltext-article 区域内
    const article = page.getByTestId("fulltext-article");
    await expect(article).toBeVisible();
    const articleText = await article.innerText();
    expect(articleText).not.toMatch(TIMESTAMP_PATTERN);
    expect(articleText.length).toBeGreaterThan(50); // 确实渲染了文章内容

    // 切换「时间戳定位」：列表出现且包含时间戳（限定在列表区域内）
    await page.getByRole("tab", { name: "时间戳定位" }).click();
    const list = page.getByTestId("transcript-list");
    await expect(list).toBeVisible();
    await expect(list.getByText(TIMESTAMP_PATTERN).first()).toBeVisible();
    await expect(page.getByText("点击时间可复制")).toBeVisible();
  });

  test("锁定 2：导出 TXT 零时间戳且包含标题", async ({ page }) => {
    await interceptApi(page);
    const taskId = await seedTaskCache(page);
    await page.goto(`/result/${taskId}`);
    const article = page.getByTestId("fulltext-article");
    await expect(article).toBeVisible();

    await page.getByRole("button", { name: "导出" }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "纯文本（.txt）" }).click();
    const file = await download;

    const content = readFileSync(await file.path(), "utf-8");
    expect(content).not.toMatch(TIMESTAMP_PATTERN); // 零时间戳
    expect(content).toContain("《"); // 包含标题（书名号包裹）
    expect(content).toContain("来源："); // 元信息行
  });

  test("锁定 3：导出 MD 含 ## 正文 结构且零时间戳", async ({ page }) => {
    await interceptApi(page);
    const taskId = await seedTaskCache(page);
    await page.goto(`/result/${taskId}`);
    const article = page.getByTestId("fulltext-article");
    await expect(article).toBeVisible();

    await page.getByRole("button", { name: "导出" }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "Markdown（.md）" }).click();
    const file = await download;

    const content = readFileSync(await file.path(), "utf-8");
    expect(content.startsWith("# ")).toBe(true); // 一级标题
    expect(content).toContain("## 正文"); // 结构化二级标题
    expect(content).toContain("> 来源："); // 引用元信息
    expect(content).not.toMatch(TIMESTAMP_PATTERN); // 零时间戳
  });

  test("锁定 4：主流程——解析 → 获取字幕 → 自动总结 → 结果页", async ({ page }) => {
    const { calls } = await interceptApi(page);
    await page.goto("/");

    await page.getByLabel("视频链接").fill("https://www.bilibili.com/video/BV1GJ411x7h7");
    await page.getByRole("button", { name: "解析", exact: true }).click();

    // 进度页：三阶段步进可见，视频卡渲染 fixture 元数据
    await page.waitForURL(/\/processing\//);
    await expect(page.getByText("获取字幕（进行中）")).toBeVisible();
    await expect(page.getByText(VIDEO.title)).toBeVisible();

    // 流水线跑完自动跳结果页（拦截下毫秒级，留 30s 余量）
    await page.waitForURL(/\/result\//, { timeout: 30_000 });
    await expect(page.getByTestId("fulltext-article")).toBeVisible();
    await expect(page.getByTestId("key-points")).toBeVisible();
    await expect(page.getByTestId("chapter-timeline")).toBeVisible();

    // 契约调用次数：parse 1 + subtitle 1 + summarize 1（无轮询）
    expect(calls.parse).toBe(1);
    expect(calls.subtitle).toBe(1);
    expect(calls.summarize).toBe(1);
  });

  test("锁定 5：来源 Badge 按 transcriptSource 显示（字幕 / 缺省不显示）", async ({ page }) => {
    await interceptApi(page);

    // 字幕来源 → 「来源：B站字幕」
    const subtitleTaskId = await seedTaskCache(page, { transcriptSource: "subtitle_ai" });
    await page.goto(`/result/${subtitleTaskId}`);
    await expect(page.getByTestId("fulltext-article")).toBeVisible();
    await expect(page.getByTestId("source-badge")).toHaveText(/来源：B站字幕/);

    // 缺省（无来源信息）→ 不显示 Badge
    const noSourceTaskId = await seedTaskCache(page, { transcriptSource: null });
    await page.goto(`/result/${noSourceTaskId}`);
    await expect(page.getByTestId("fulltext-article")).toBeVisible();
    await expect(page.getByTestId("source-badge")).toHaveCount(0);
  });

  test("锁定 6：AI 总结面板渲染带时间戳的 keyPoints 与带时间区间的章节", async ({ page }) => {
    await interceptApi(page);
    const taskId = await seedTaskCache(page);
    await page.goto(`/result/${taskId}`);
    await expect(page.getByTestId("fulltext-article")).toBeVisible();

    // 核心要点：至少一条带时间戳徽章（keyPoints.time 指向原 transcript）
    const keyPoints = page.getByTestId("key-points");
    await expect(keyPoints).toBeVisible();
    expect(await keyPoints.locator("li").count()).toBeGreaterThanOrEqual(3);
    await expect(keyPoints.getByText(TIMESTAMP_PATTERN).first()).toBeVisible();

    // 章节笔记：时间区间（mm:ss–mm:ss）渲染
    const chapters = page.getByTestId("chapter-timeline");
    await expect(chapters).toBeVisible();
    await expect(chapters.getByText(/\d{1,2}:\d{2}–\d{1,2}:\d{2}/).first()).toBeVisible();
  });

  test("锁定 7：总结失败降级——文字稿可见 + 错误卡与重试 + 导出同源", async ({ page }) => {
    await interceptApi(page, { summarizeFail: true });

    // 直链结果页：缓存有文字稿但无总结 → recover 补总结失败 → 仅总结区降级
    const taskId = await seedTaskCache(page, { withSummary: false });
    await page.goto(`/result/${taskId}`);

    // 文字稿照常渲染（默认全文阅读 Tab、零时间戳）——总结失败不得拖垮主体
    const article = page.getByTestId("fulltext-article");
    await expect(article).toBeVisible();
    const articleText = await article.innerText();
    expect(articleText.length).toBeGreaterThan(50);
    expect(articleText).not.toMatch(TIMESTAMP_PATTERN);

    // 总结区：错误卡 + 重试按钮（不再整页错误/骨架）
    await expect(page.getByTestId("summary-error")).toBeVisible();
    await expect(page.getByRole("button", { name: "重试总结" })).toBeVisible();
    await expect(page.getByTestId("fulltext-article")).toBeVisible(); // 错误卡出现后文字稿仍在

    // 导出同源回归（summary 为 null 的边界）：TXT/MD 与页面全文视图同源、零时间戳
    await page.getByRole("button", { name: "导出" }).click();
    const txtDownload = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "纯文本（.txt）" }).click();
    const txt = readFileSync(await (await txtDownload).path(), "utf-8");
    expect(txt).not.toMatch(TIMESTAMP_PATTERN);
    expect(txt).toContain("《");

    await page.getByRole("button", { name: "导出" }).click();
    const mdDownload = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "Markdown（.md）" }).click();
    const md = readFileSync(await (await mdDownload).path(), "utf-8");
    expect(md).toContain("## 正文");
    expect(md).not.toMatch(TIMESTAMP_PATTERN);

    // 三者同源：页面全文视图的首段（前 20 字）必须出现在 TXT 导出中
    const firstParagraph = articleText
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 10);
    expect(firstParagraph).toBeTruthy();
    expect(txt).toContain(firstParagraph!.slice(0, 20));
  });

  test("锁定 8：无字幕视频直接报错并引导返回（无 ASR 兜底）", async ({ page }) => {
    await interceptApi(page, { noSubtitle: true });
    await page.goto("/");

    await page.getByLabel("视频链接").fill("https://www.bilibili.com/video/BV1GJ411x7h7");
    await page.getByRole("button", { name: "解析", exact: true }).click();

    await page.waitForURL(/\/processing\//);
    // 流水线在获取字幕阶段失败：错误码 NO_SUBTITLE 的中文提示 + 返回首页
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/该视频无可用字幕（UP 主未上传/)).toBeVisible();
    await expect(page.getByRole("button", { name: "返回首页" })).toBeVisible();

    // 不支持平台在首页即被本地拦截（不发起任何请求）
    await page.getByRole("button", { name: "返回首页" }).click();
    await page.getByLabel("视频链接").fill("https://v.qq.com/x/cover/mzc00200xxxx.html");
    await page.getByRole("button", { name: "解析", exact: true }).click();
    await expect(page.getByText(/暂不支持「v\.qq\.com」/)).toBeVisible();
    expect(page.url()).toContain("/");
  });

  test("锁定 9：任务缓存 miss 时报「任务已过期」而非白屏", async ({ page }) => {
    await interceptApi(page);
    // 合法 taskId 但 localStorage 无缓存（如隐私模式 / 缓存被清）
    const taskId = taskIdWithTitle(VIDEO.title);
    await page.goto(`/result/${taskId}`);

    // 注意：Next 的 route announcer 也带 role=alert，用标题文案精确定位错误卡
    await expect(page.getByRole("heading", { name: "任务不存在" })).toBeVisible();
    await expect(page.getByText(/任务已过期或本地缓存已清除/)).toBeVisible();
    await expect(page.getByRole("button", { name: "返回首页" })).toBeVisible();
  });

  test("锁定 10：AI 总结开关与手动生成（关闭后不自动总结，手动按钮可生成）", async ({ page }) => {
    const { calls } = await interceptApi(page);

    await page.goto("/");
    const toggle = page.getByTestId("auto-summary-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-checked", "true"); // 默认开启（自动总结由锁定 4 覆盖）

    // 关闭开关 → 立即持久化到 localStorage（仅布尔值）
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(await page.evaluate(() => localStorage.getItem("autoSummary"))).toBe("false");

    // 刷新后仍保持关闭（跨会话持久化 + 挂载后水合）
    await page.reload();
    await expect(page.getByTestId("auto-summary-toggle")).toHaveAttribute("aria-checked", "false");

    // 关闭状态下走完整流程：字幕获取完成即进结果页，但不自动总结
    await page.getByLabel("视频链接").fill("https://www.bilibili.com/video/BV1GJ411x7h7");
    await page.getByRole("button", { name: "解析", exact: true }).click();
    await page.waitForURL(/\/result\//, { timeout: 30_000 });
    await expect(page.getByTestId("fulltext-article")).toBeVisible();
    await expect(page.getByTestId("key-points")).toHaveCount(0); // 没有自动总结
    expect(calls.summarize).toBe(0); // 也没发过 summarize 请求

    // 未总结引导 + 手动生成按钮
    await expect(page.getByTestId("summary-manual-prompt")).toBeVisible();
    const manualButton = page.getByTestId("manual-summarize-button");
    await expect(manualButton).toBeVisible();
    await expect(manualButton).toHaveText(/生成 AI 总结/);

    // 手动生成 → 总结渲染（与 P0 错误重试共用 retrySummary 逻辑）
    await manualButton.click();
    await expect(page.getByTestId("key-points")).toBeVisible();
    await expect(page.getByTestId("chapter-timeline")).toBeVisible();
    expect(calls.summarize).toBe(1);

    // 刷新恢复（recover 路径）同样尊重开关：总结已在缓存则直接渲染，不再重复请求
    await page.reload();
    await expect(page.getByTestId("fulltext-article")).toBeVisible();
    await expect(page.getByTestId("key-points")).toBeVisible();
    expect(calls.summarize).toBe(1);
  });

  test("锁定 11：设置弹窗配置 LLM Key——存 localStorage、随请求发送、服务端未配也能总结", async ({
    page,
  }) => {
    // 服务端 env 未配 Key（summarizeUnconfigured）→ 只有本机配置后总结才可用
    const { calls, summarizeRequests } = await interceptApi(page, { summarizeUnconfigured: true });
    await page.goto("/");

    // 打开顶栏设置弹窗
    await page.getByTestId("settings-button").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("settings-dialog")).toBeVisible();

    // 配置 provider + Key + 模型覆盖
    await page.getByLabel("模型服务商").selectOption("deepseek");
    await page.getByLabel("API Key").fill("sk-e2e-local-key");
    await page.getByLabel("模型（可选）").fill("deepseek-flash");
    await page.getByTestId("settings-save").click();
    await expect(dialog).toHaveCount(0); // 保存后关闭

    // 持久化到 localStorage（llmSettings，明文 JSON）
    const stored = await page.evaluate(() => localStorage.getItem("llmSettings"));
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored!)).toEqual({
      provider: "deepseek",
      apiKey: "sk-e2e-local-key",
      model: "deepseek-flash",
    });

    // 走主流程 → 总结可用（本机配置合并进 capabilities）
    await page.getByLabel("视频链接").fill("https://www.bilibili.com/video/BV1GJ411x7h7");
    await page.getByRole("button", { name: "解析", exact: true }).click();
    await page.waitForURL(/\/result\//, { timeout: 30_000 });
    await expect(page.getByTestId("key-points")).toBeVisible();
    expect(calls.summarize).toBe(1);

    // Key 随 /api/summarize 请求体的 llm 字段发送（服务端代理上游）
    expect(summarizeRequests[0].llm).toEqual({
      provider: "deepseek",
      apiKey: "sk-e2e-local-key",
      model: "deepseek-flash",
    });

    // 刷新后配置仍在（localStorage 跨会话持久化）
    await page.reload();
    await page.getByTestId("settings-button").click();
    await expect(page.getByLabel("API Key")).toHaveValue("sk-e2e-local-key");
    await expect(page.getByLabel("模型服务商")).toHaveValue("deepseek");
  });

  test("锁定 12：两级配置都缺失——不发 summarize 请求，总结区显示设置引导", async ({ page }) => {
    const { calls } = await interceptApi(page, { summarizeUnconfigured: true });

    // 直链结果页：缓存有文字稿但无总结 + 服务端/本机均未配 Key
    const taskId = await seedTaskCache(page, { withSummary: false });
    await page.goto(`/result/${taskId}`);

    // 文字稿照常渲染；总结区给配置引导（不可重试态）
    await expect(page.getByTestId("fulltext-article")).toBeVisible();
    await expect(page.getByTestId("summary-error")).toBeVisible();
    await expect(page.getByTestId("summary-config-hint")).toBeVisible();
    await expect(page.getByRole("button", { name: "重试总结" })).toHaveCount(0);

    // 未配置时不发起无用的 summarize 请求
    expect(calls.summarize).toBe(0);
  });
});
