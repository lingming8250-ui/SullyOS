/**
 * 微信壳的「回来」记号。
 *
 * 背景：糯米机没有导航栈——openApp 是整体替换。所以从微信点进聊天之后，
 * 按返回（边缘侧滑 / 安卓返回键 / 浏览器返回）会直接回桌面，而不是回微信列表。
 *
 * OSContext 给 App 留了个口子：registerBackHandler(handler)。系统按返回时先问
 * 这个 handler，它返回 true 就表示「我接住了」。
 *
 * 于是：微信点进任何子页面之前，在这里留个记号；微信注册的返回处理器看到记号
 * 就 openApp 把用户送回微信，并顺手恢复上次的 Tab。
 *
 * 两个细节：
 *  1. 处理器故意不注销——微信壳被 openApp 换掉（组件卸载）之后，它还得活着。
 *  2. 记号有保质期。万一用户从聊天直接关到桌面、之后在别处按返回，不至于被
 *     莫名其妙拽回微信。
 */

/** 记号保质期。超时自动作废。 */
const TTL_MS = 3 * 60 * 1000;

let armed = false;
let lastTab = 'chats';
let expireAt = 0;

export const wechatNav = {
    /** 从微信离开、去往子页面之前调用。 */
    leave(tab: string): void {
        armed = true;
        lastTab = tab;
        expireAt = Date.now() + TTL_MS;
    },

    /** 记号还在保质期内吗？（不消费） */
    isArmed(): boolean {
        return armed && Date.now() <= expireAt;
    },

    /** 取回上次的 Tab 并清掉记号。微信壳重新挂载时调一次。 */
    consumeTab(): string | null {
        const t = wechatNav.isArmed() ? lastTab : null;
        armed = false;
        expireAt = 0;
        return t;
    },

    /** 手动清掉记号。 */
    clear(): void {
        armed = false;
        expireAt = 0;
    },
};
