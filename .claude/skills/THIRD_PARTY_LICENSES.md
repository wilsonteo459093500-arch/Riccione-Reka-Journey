# Third-party skill licenses · 第三方 skill 许可证

以下 skill 是从 GitHub 公开仓库复制（vendored）进本仓库的，原作者与许可证如下。更新方式见 [README.md](./README.md)。

| 目录 | 来源仓库 | 版本 (commit) | 许可证 |
|---|---|---|---|
| `ai-seo/` | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) `skills/ai-seo` | 5b2c000 (2026-09-04) | MIT |
| `copy-editing/` | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) `skills/copy-editing` | 5b2c000 (2026-09-04) | MIT |
| `copywriting/` | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) `skills/copywriting` | 5b2c000 (2026-09-04) | MIT |
| `customer-research/` | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) `skills/customer-research` | 5b2c000 (2026-09-04) | MIT |
| `emails/` | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) `skills/emails` | 5b2c000 (2026-09-04) | MIT |
| `marketing-psychology/` | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) `skills/marketing-psychology` | 5b2c000 (2026-09-04) | MIT |
| `offers/` | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) `skills/offers` | 5b2c000 (2026-09-04) | MIT |
| `product-marketing/` | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) `skills/product-marketing` | 5b2c000 (2026-09-04) | MIT |
| `referrals/` | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) `skills/referrals` | 5b2c000 (2026-09-04) | MIT |
| `sales-enablement/` | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) `skills/sales-enablement` | 5b2c000 (2026-09-04) | MIT |
| `social/` | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) `skills/social` | 5b2c000 (2026-09-04) | MIT |
| `storybrand-messaging/` | [wondelai/skills](https://github.com/wondelai/skills) `plugins/wondelai-skills/skills/storybrand-messaging` | eade5d1 (2026-08-29) | MIT |
| `brand-manifesto/` | [arnabbagxd/Brand-building-skills](https://github.com/arnabbagxd/Brand-building-skills) `skills/brand-manifesto` | 4a0a8b5 (2026-06-12) | MIT |
| `brand-voice/` | [arnabbagxd/Brand-building-skills](https://github.com/arnabbagxd/Brand-building-skills) `skills/brand-voice` | 4a0a8b5 (2026-06-12) | MIT |
| `brand-architecture/` | [arnabbagxd/Brand-building-skills](https://github.com/arnabbagxd/Brand-building-skills) `skills/brand-architecture` | 4a0a8b5 (2026-06-12) | MIT |
| `hook-writer/` | [social-media-skills/skills](https://github.com/social-media-skills/skills) `skills/hook-writer` | 6e30eeb (2026-07-19) | MIT |
| `short-form-video-script/` | [social-media-skills/skills](https://github.com/social-media-skills/skills) `skills/short-form-video-script` | 6e30eeb (2026-07-19) | MIT |
| `facebook-strategy/` | [social-media-skills/skills](https://github.com/social-media-skills/skills) `skills/facebook-strategy` | 6e30eeb (2026-07-19) | MIT |
| `xiaohongshu-content-strategist/` | [demo112/yunqu-ai-skills](https://github.com/demo112/yunqu-ai-skills) `08-xiaohongshu-content-strategist` | 6676d21 (2026-05-14) | MIT |
| `humanizer-zh/` | [op7418/Humanizer-zh](https://github.com/op7418/Humanizer-zh) | 91f3d39 (2026-01-19) | MIT |
| `content-humanizer/` | [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) `marketing-skill/skills/content-humanizer` | 19392f7 (2026-08-26) | MIT |
| `woodworking/` | [bacarndiaye/woodworking-skill](https://github.com/bacarndiaye/woodworking-skill) `skill/` | d701b00 (2026-06-15) | MIT |
| `daylighting-design/` | [Abhinavbwj/Skills-Architects](https://github.com/Abhinavbwj/Skills-Architects) `skills/daylighting-design` | 30a0845 (2026-05-20) | MIT |
| `product-research/` | [AlpacaLabsLLC/skills-for-architects](https://github.com/AlpacaLabsLLC/skills-for-architects) `skills/product-research` + `schema/` | e7e3644 (2026-09-03) | MIT |
| `ai-video-prompt/` | [smixs/visual-skills](https://github.com/smixs/visual-skills) `video/` · 作者 Serge Shima | 3c55471 (2026-08-08) | CC BY 4.0（须署名，已署） |
| `frontend-design/` | [anthropics/skills](https://github.com/anthropics/skills) `skills/frontend-design` | 41bbe19 (2026-09-03) | Apache-2.0（见目录内 LICENSE.txt） |
| `banana/` | banana-claude（SKILL.md 元数据所记作者 AgriciDaniel） | 1.4.1 | 见 SKILL.md 元数据 |
| `interior-design-expert/` | mcpmarket interior-design-expert 1.0.0 + SAIL 定制扩展 | 1.1.0 | Apache-2.0 |
| `furniture-brand-storyteller/` | 本仓库原创 | 1.0.0 | Apache-2.0 |

## 本地改动（相对上游）

- `content-humanizer`、`brand-manifesto`、`brand-voice`、`brand-architecture`：上下文文件路径统一改为 `.agents/product-marketing.md`（上游分别用 `.claude/product-marketing-context.md` 与 `.agents/brand-context.md`）。
- `hook-writer`、`short-form-video-script`、`facebook-strategy`：H1 下加了一行仓库说明，把上游的 `brand-profile` / `voice-builder` 指向 `.agents/product-marketing.md`。
- `product-research`：把上游 `schema/` 两个文件复制进 skill 目录，路径由 `../../schema/` 改为 `./schema/`。
- `xiaohongshu-content-strategist`、`ai-video-prompt`：frontmatter `name` 改为与目录同名（上游分别为 `Xiaohongshu Content Strategist`、`video`）。

---

## MIT License — coreyhaines31/marketingskills

```
MIT License

Copyright (c) 2025 Corey Haines

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## MIT License — wondelai/skills

```
MIT License

Copyright (c) 2025 Wondel.ai sp. z o.o.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## MIT License — arnabbagxd/Brand-building-skills

```
MIT License

Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## MIT License — social-media-skills/skills

```
MIT License

Copyright (c) 2026 Frank Heijdenrijk

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## MIT License — demo112/yunqu-ai-skills

```
MIT License

Copyright (c) 2026 云渡 AI (demo112)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## MIT License — op7418/Humanizer-zh

```
MIT License

Copyright (c) 2026 歸藏

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## MIT License — alirezarezvani/claude-skills

```
MIT License

Copyright (c) 2025 Alireza Rezvani

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## MIT License — bacarndiaye/woodworking-skill

```
MIT License

Copyright (c) 2026 bacarndiaye

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## MIT License — Abhinavbwj/Skills-Architects

```
MIT License

Copyright (c) 2026 Abhinav Bhardwaj

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## MIT License — AlpacaLabsLLC/skills-for-architects

```
MIT License

Copyright (c) 2026 Alpaca Design Lab LLC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## CC BY 4.0 — smixs/visual-skills (ai-video-prompt)

作者 Serge Shima，https://github.com/smixs/visual-skills 。本仓库复制了其 `video/` skill 并改名为 `ai-video-prompt`（frontmatter name 改动，内容未改）。许可证全文：https://creativecommons.org/licenses/by/4.0/legalcode

## Apache License 2.0 — anthropics/skills (frontend-design)

全文见 `frontend-design/LICENSE.txt`。
