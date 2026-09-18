/**
 * 「打开某个群聊」的跨 App 传参。
 *
 * 和 utils/characterLaunch.ts 同一套路。差别在于：单聊当前打开的是谁，
 * OSContext 里有 activeCharacterId 可以直接设；而群聊当前打开的是哪个群，
 * 是 GroupChat 组件内部的 state，外部 App 摸不到。
 *
 * 所以在全局放一个「一次性意图」：外部（比如微信壳的会话列表）request 一下，
 * GroupChat 挂载或进入 chat 视图时 consume 掉。consume 之后即清空，
 * 不会在下次打开群聊时误跳。
 */

let pendingGroupId: string | null = null;

export const groupLaunch = {
    /** 记下一个「等下要打开这个群」的意图。 */
    request(groupId: string): void {
        pendingGroupId = groupId;
    },

    /** 看一眼，不清掉。给需要在挂载前预判的地方用。 */
    peek(): string | null {
        return pendingGroupId;
    },

    /** 取走意图并清空。同一份意图只会被消费一次。 */
    consume(): string | null {
        const value = pendingGroupId;
        pendingGroupId = null;
        return value;
    },
};
