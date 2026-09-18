/**
 * ⚠️ 这个文件被临时借去当「微信壳」的入口了。
 *
 * 原来的内置浏览器（Sully Browser）代码一字未动，完整地留在 git 历史里。
 * 要取回它：把下面这行换成旧版本，或者
 *   git show 63fa22af:apps/BrowserApp.tsx > apps/BrowserApp.tsx
 *
 * 为什么借它：新增一个 App 需要改 types.ts（181KB）和 components/PhoneShell.tsx（一千行），
 * 而这两个文件只能整文件重写，风险太高。AppID.Browser 是作者从桌面上隐藏的槽位
 * （constants.tsx 里那行被注释掉了），但 PhoneShell 的 renderApp 里给它留着 case，
 * 所以拿它当入口最省事。
 *
 * 等微信壳拿回自己的 AppID（types.ts 加一行、PhoneShell 加三行），删掉这个文件、
 * 让它换回真正的浏览器即可。
 */
export { default } from './WeChat';
