# 问心

一个轻量的响应式网页：选择妈祖、观音菩萨、关帝爷或玄天上帝，输入自己的问题，通过两枚闽南传统月牙形筊杯完成数字投杯，最后只查看杯象。

网页不会把问题发送给 AI，不保存问题，不做吉凶解读，也不宣称代表真实的神明回应。

## 完整流程

1. 首页同时展示四幅国风神明插画。
2. 点击一位神明，进入共用请示页面。
3. 输入 1 至 200 字的个人问题。
4. 点击“掷杯”，程序分别随机生成两枚筊杯朝向。
5. 观看抛起、翻转、旋转、落地动画。
6. 动画结束后只显示“圣杯”“笑杯”或“阴杯”及对应图示。
7. 当前问题只能投杯一次；结果出来后选择“继续请示”，清空上一问并在同一位神明前重新输入。
8. 点击顶部“返回四位神明”可回到首页重新选择神明。

## 杯象规则

| 第一枚 | 第二枚 | 杯象 |
|---|---|---|
| 平面 | 平面 | 笑杯 |
| 凸面 | 凸面 | 阴杯 |
| 平面 | 凸面 | 圣杯 |
| 凸面 | 平面 | 圣杯 |

两枚筊杯分别独立随机。神明选择和输入的问题不会改变判定。

## 项目结构

```text
public/
  index.html                  页面结构
  styles.css                  国风视觉、响应式布局和杯子动画
  app.js                      页面流程与交互
  ritual.mjs                  神明配置、随机投杯和杯象判定
  assets/deities/             四幅首页全身像与四幅请示页端坐像
  assets/decor/               首页庙宇山水氛围图
  assets/jiaobei/             平面与凸面月牙形筊杯透明 PNG
  favicon.svg
assets/reference/             用户提供的两张原始参考图
src/
  server.mjs                  零依赖静态文件服务
test/
  ritual.test.mjs             随机、杯象和输入规则
  simple-browser.test.mjs     Edge 桌面与手机流程验收
  source-hygiene.test.mjs     页面样式与运行时类名一致性检查
  support/cdp-browser.mjs     浏览器测试辅助
scripts/
  scan-secrets.mjs            仓库密钥扫描
docs/
  asset-sources.md            素材来源与替换说明
  test-report.md              实际测试结果
start.ps1                     启动脚本
stop.ps1                      后台停止脚本
```

## 启动

```powershell
cd minnan-four-deities-v1
.\start.ps1
```

浏览器打开：

```text
http://127.0.0.1:8765
```

后台运行：

```powershell
.\start.ps1 -Background -BindHost 0.0.0.0
```

停止后台服务：

```powershell
.\stop.ps1
```

手机和电脑连接同一 Wi-Fi 后，将 `<电脑局域网 IPv4>` 替换为电脑实际局域网地址：

```text
http://<电脑局域网 IPv4>:8765
```

## 测试

```powershell
npm test
npm run test:domain
npm run test:browser
npm run scan:secrets
```

测试会实际启动静态服务并使用本机 Microsoft Edge 检查四张图片加载、四神入口、问题输入、单次投杯限制、投杯动画、杯象与最终图示一致性、继续请示和无 API 请求。

## 素材

首页四幅全身像由用户提供的第一张四神拼图裁切得到；进入请示页后改为使用第二张手机效果图裁出的四幅端坐像。首页底部庙宇山水同样取自第二张图中不含页面控件的部分。两张原始参考图保存在 `assets/reference/`，素材说明见 [docs/asset-sources.md](docs/asset-sources.md)。

## 隐私

- 问题只在当前浏览器页面内使用。
- 不发送到服务器、AI 或其他第三方。
- 不写入数据库，不保存在 `localStorage` 或 Cookie。
- 关闭或刷新页面后，本轮问题和杯象不会自动恢复。
