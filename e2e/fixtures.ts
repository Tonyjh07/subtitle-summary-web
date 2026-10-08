import type { Page } from "@playwright/test";

/**
 * E2E fixture：通过 Playwright route interception 接管 /api/*（Mock 层已删除，
 * 见 docs/MIGRATION.md §2）。fixture 数据形状与 src/lib/types.ts 契约一致。
 */

// ---- taskId（与 src/lib/task-cache.ts 的 encodeTaskId 同款 base64url(JSON)）----

export function makeTaskId(payload: {
  v: string;
  p: "bilibili";
  s: number;
  m?: { t: string; c: string; d: number };
}): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/** 含元数据的 taskId：直链访问结果页/进度页时视频卡可直接渲染 */
export function taskIdWithTitle(title: string): string {
  return makeTaskId({
    v: "BV1GJ411x7h7",
    p: "bilibili",
    s: Date.now(),
    m: { t: title, c: "https://i0.hdslb.com/cover.jpg", d: 754 },
  });
}

// ---- fixture 数据 ----

/** 文字稿（无任何 mm:ss 形态文本，保证「正文零时间戳」断言干净） */
export const TRANSCRIPT = [
  { time: 0, text: "大家好，欢迎回到频道。今天这期视频我们来聊一个很多人都会遇到的需求：怎么把视频快速变成文字稿。" },
  { time: 22, text: "不管你是想做课程笔记、内容复盘，还是给视频配字幕，手动整理都太费时间了。" },
  { time: 45, text: "先说结论：如今的字幕工具已经能做到秒级返回，粘贴链接就能拿到带时间戳的文字稿。" },
  { time: 68, text: "但是注意，字幕覆盖是有缺口的：UP 主没传字幕、AI 字幕又没生成的视频，就只能换一个视频。" },
  { time: 118, text: "接下来我们看原理。字幕接口分两层，一层是手传的 CC 字幕，一层是平台自动生成的 AI 字幕。" },
  { time: 170, text: "取到字幕轨道之后，还需要按语言优先级排序，中文优先，CC 优先于 AI，然后逐条下载解析。" },
  { time: 226, text: "最后一步是总结。把带时间戳的文字稿交给大模型，它会输出概要、要点和章节笔记。" },
  { time: 300, text: "以上就是本期视频的全部内容，如果你觉得有帮助，欢迎三连支持，我们下期再见。" },
];

export const SUMMARY = {
  summary: "本期视频讲解了把视频快速转成文字稿并自动生成总结的完整流程，覆盖字幕获取与 AI 总结两个环节。",
  keyPoints: [
    { time: 0, text: "粘贴链接即可获取带时间戳的文字稿" },
    { time: 68, text: "无字幕的视频只能换一个，不做语音识别兜底" },
    { time: 170, text: "字幕轨道按中文优先、CC 优先排序解析" },
    { time: 226, text: "大模型输出概要、要点与章节笔记" },
  ],
  chapters: [
    { title: "开篇：需求与结论", timeStart: 0, timeEnd: 68, note: "视频转文字的核心诉求与字幕快路径结论。" },
    { title: "原理：字幕双轨道", timeStart: 118, timeEnd: 226, note: "CC 与 AI 两层字幕轨道的获取与排序。" },
    { title: "总结与结尾", timeStart: 226, timeEnd: 300, note: "大模型总结与收尾。" },
  ],
};

export const VIDEO = {
  title: "【E2E Fixture】视频转文字完整流程演示",
  cover: "https://i0.hdslb.com/cover.jpg",
  duration: 754,
  platform: "bilibili" as const,
  videoId: "BV1GJ411x7h7",
};

// ---- API 拦截 ----

export interface InterceptOptions {
  /** /api/summarize 返回 500（模拟 LLM 故障） */
  summarizeFail?: boolean;
  /** /api/subtitle 返回 404 NO_SUBTITLE（无字幕视频） */
  noSubtitle?: boolean;
  /** /api/capabilities 返回 summarizeConfigured:false */
  summarizeUnconfigured?: boolean;
}

function json(body: unknown, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

/** 拦截全部 /api/*，返回可修改的 fixture 通道（须在 page.goto 之前调用）。
 *  summarizeRequests 逐条记录 /api/summarize 请求体（断言前端 llm 配置是否随请求发送）。 */
export async function interceptApi(page: Page, options: InterceptOptions = {}) {
  const calls = { parse: 0, subtitle: 0, summarize: 0 };
  const summarizeRequests: Record<string, unknown>[] = [];

  await page.route("**/api/parse", (route) => {
    calls.parse += 1;
    const { url } = route.request().postDataJSON() as { url: string };
    if (!url.includes("bilibili.com")) {
      return route.fulfill(
        json({ error: { code: "UNSUPPORTED_PLATFORM", message: "暂不支持该平台，当前仅支持哔哩哔哩" } }, 422),
      );
    }
    return route.fulfill(json(VIDEO));
  });

  await page.route("**/api/subtitle", (route) => {
    calls.subtitle += 1;
    if (options.noSubtitle) {
      return route.fulfill(
        json(
          {
            error: {
              code: "NO_SUBTITLE",
              message: "该视频无可用字幕（UP 主未上传 CC 字幕，AI 字幕也未生成），暂无法生成文字稿",
            },
          },
          404,
        ),
      );
    }
    return route.fulfill(
      json({
        transcript: TRANSCRIPT,
        plainText: TRANSCRIPT.map((item) => item.text).join(""),
        transcriptSource: "subtitle_ai",
      }),
    );
  });

  await page.route("**/api/summarize", (route) => {
    calls.summarize += 1;
    summarizeRequests.push((route.request().postDataJSON() ?? {}) as Record<string, unknown>);
    if (options.summarizeFail) {
      return route.fulfill(
        json({ error: { code: "SUMMARIZE_FAILED", message: "AI 总结服务连接失败，请稍后重试" } }, 502),
      );
    }
    return route.fulfill(json(SUMMARY));
  });

  await page.route("**/api/capabilities", (route) =>
    route.fulfill(json({ summarizeConfigured: !options.summarizeUnconfigured })),
  );

  await page.route("**/api/health", (route) => route.fulfill(json({ status: "ok" })));

  return { calls, summarizeRequests };
}

/**
 * 直链访问结果页前，向 localStorage 种入任务结果缓存
 * （键与 src/lib/task-cache.ts 的 taskCacheKey 一致）。
 */
let seedSeq = 0;

export async function seedTaskCache(
  page: Page,
  options: { withSummary?: boolean; transcriptSource?: "subtitle_ai" | "subtitle_cc" | null } = {},
): Promise<string> {
  const { withSummary = true, transcriptSource = "subtitle_ai" } = options;
  // taskId 带序号保证同页多次 seed 不同键（startedAt 仅作唯一性来源，无语义）
  seedSeq += 1;
  const taskId = makeTaskId({
    v: VIDEO.videoId,
    p: "bilibili",
    s: Date.now() + seedSeq,
    m: { t: VIDEO.title, c: VIDEO.cover, d: VIDEO.duration },
  });

  const entry = JSON.stringify({
    video: VIDEO,
    transcript: TRANSCRIPT,
    plainText: TRANSCRIPT.map((item) => item.text).join(""),
    transcriptSource,
    summary: withSummary ? SUMMARY : null,
    savedAt: Date.now(),
  });

  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key as string, value as string);
    },
    [`subtitle-summary:task:${taskId}`, entry],
  );

  return taskId;
}
