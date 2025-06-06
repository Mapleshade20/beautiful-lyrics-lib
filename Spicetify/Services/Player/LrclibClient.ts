import type { ProviderLyrics } from "./LyricUtilities.ts"

export interface LrclibLine { offset: number; content: string }
export interface LrclibResponse {
    syncedLyrics?: string;  // lrc 格式
    plainLyrics?: string;
    instrumental: boolean;
}

export async function fetchLrclibLyrics(title: string, artist: string): Promise<LrclibResponse> {
    const params = new URLSearchParams({ track_name: title, artist_name: artist });
    const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`);
    const data = await res.json() as LrclibResponse;
    return data;
}

/** 将 lrc/text 转为 ProviderLyrics 所需格式 */
export function parseLrclibToProvider(data: LrclibResponse): ProviderLyrics {
    // 纯伴奏
    if (data.instrumental) {
        return {
            Type: "Static",
            Lines: [],
        }
    }

    // 逐行同步
    if (data.syncedLyrics) {
        const rawLines = data.syncedLyrics.split(/\r?\n/);
        type ParsedLine = { offset: number; text?: string; isInterlude: boolean }
        const parsed: ParsedLine[] = [];
        const timeRe = /^\[(\d{2}):(\d{2}\.\d{2})\](.*)$/;

        for (const line of rawLines) {
            const m = line.match(timeRe);
            if (!m) continue;
            const minutes = parseInt(m[1], 10);
            const seconds = parseFloat(m[2]);
            const offset = minutes * 60 + seconds;
            const text = m[3].trim();
            parsed.push({
                offset,
                isInterlude: text === "",
                text: text || undefined
            });
        }

        // ←—— 新增：如果最后一行是纯时间戳（isInterlude），则丢弃
        if (parsed.length > 0 && parsed[parsed.length - 1].isInterlude) {
            parsed.pop();
        }

        if (parsed.length > 0) {
            const content = parsed.map((item, i) => {
                const start = item.offset;
                const end = (i + 1 < parsed.length)
                    ? parsed[i + 1].offset
                    : item.offset;
                if (item.isInterlude) {
                    return {
                        Type: "Interlude" as const,
                        StartTime: start,
                        EndTime: end
                    };
                }
                return {
                    Type: "Vocal" as const,
                    OppositeAligned: false,
                    Text: item.text!,
                    StartTime: start,
                    EndTime: end
                };
            });

            return {
                Type: "Line" as const,
                StartTime: content[0].StartTime,
                EndTime: content[content.length - 1].EndTime,
                Content: content
            };
        }
    }

    // 回退：无同步歌词，使用纯文本
    if (data.plainLyrics) {
        return {
            Type: "Static",
            Lines: data.plainLyrics
                .split(/\r?\n/)
                .filter(l => l.trim().length > 0)
                .map(l => ({ Text: l })),
        }
    }

    // 极端情况：什么都没有
    return {
        Type: "Static",
        Lines: [],
    }
}