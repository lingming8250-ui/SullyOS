import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppID } from '../types';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { characterLaunch } from '../utils/characterLaunch';
import { groupLaunch } from '../utils/groupLaunch';
import { wechatNav } from '../utils/wechatNav';
import { ChatTeardrop, UsersThree, Compass, UserCircle } from '@phosphor-icons/react';

/**
 * 微信壳。
 *
 * 把原本散在桌面上的四个入口收进一条底部 Tab：
 *   消息   —— 单聊 + 群聊混排的会话列表
 *   通讯录 —— 原来的「神经链接」
 *   朋友圈 —— 原来的 Spark
 *   我     —— 原来的「档案」
 *
 * 返回行为：糯米机没有导航栈（openApp 是整体替换），所以从微信点进聊天再按返回
 * 会直接回桌面。这里用 OSContext 的 registerBackHandler 把「从微信出去」这件事
 * 接住：出去之前留个记号（utils/wechatNav），按返回时看到记号就回微信。
 *
 * 注意：本组件目前挂在 AppID.Browser 那个隐藏槽位上（BrowserApp 转发到这里），
 * 所以「回微信」要 openApp(AppID.Browser)。等微信拿到自己的 AppID，这行跟着换。
 *
 * 安全区：底部 Tab 栏自己用 --safe-bottom 让位，所以本 App 必须出现在
 * utils/safeAreaApps.ts 的 SELF_SAFE_AREA_APPS 名单里。
 */

const GREEN = '#07c160';

/** 微信壳在 OS 里借用的槽位。以后有真 AppID 了改这里。 */
const WECHAT_SLOT = AppID.Browser;

type TabKey = 'chats' | 'contacts' | 'moments' | 'me';

interface ConvRow {
    key: string;
    kind: 'char' | 'group';
    id: string;
    name: string;
    avatar: string;
    preview: string;
    timestamp: number;
    unread: number;
}

/** 把一条消息压成列表里那一行灰字。图片/表情/语音不把正文（URL、base64）抖出来。 */
const previewOf = (msg: any): string => {
    if (!msg) return '';
    switch (msg.type) {
        case 'image': return '[图片]';
        case 'emoji': return '[表情]';
        case 'voice': return '[语音]';
        case 'transfer': return '[转账]';
        case 'system': return '';
        default: {
            const raw = typeof msg.content === 'string' ? msg.content : '';
            return raw.replace(/\s+/g, ' ').trim().slice(0, 28);
        }
    }
};

/** 微信那种右上角时间：今天给时分，昨天给「昨天」，再往前给月/日。 */
const formatTime = (ts: number): string => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    const yesterday = new Date(now.getTime() - 86400000);
    if (d.toDateString() === yesterday.toDateString()) return '昨天';
    return `${d.getMonth() + 1}/${d.getDate()}`;
};

const Avatar: React.FC<{ src?: string; name: string; badge?: number }> = ({ src, name, badge }) => (
    <div className="relative shrink-0">
        {src ? (
            <img src={src} alt="" className="w-11 h-11 rounded-xl object-cover bg-slate-200" />
        ) : (
            <div className="w-11 h-11 rounded-xl bg-slate-300 text-white flex items-center justify-center font-bold">
                {(name || '?').slice(0, 1)}
            </div>
        )}
        {!!badge && badge > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {badge > 99 ? '99+' : badge}
            </span>
        )}
    </div>
);

const WeChat: React.FC = () => {
    const { characters, groups, unreadMessages, clearUnread, openApp, setActiveCharacterId, activeCharacterId, userProfile, lastMsgTimestamp, registerBackHandler } = useOS();

    // 重新挂载时把上次的 Tab 取回来（从子页面返回的那一次）。
    const [tab, setTab] = useState<TabKey>(() => (wechatNav.consumeTab() as TabKey) || 'chats');
    const [lastByKey, setLastByKey] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(true);

    // 注册返回处理器：看到「从微信出去」的记号就回微信，并告诉系统「我接住了」。
    // 故意不注销——本组件被换掉之后，它还得活着，否则聊天里的返回又掉回桌面。
    const registered = useRef(false);
    useEffect(() => {
        if (registered.current || typeof registerBackHandler !== 'function') return;
        registered.current = true;
        registerBackHandler(() => {
            if (!wechatNav.isArmed()) return false;
            openApp(WECHAT_SLOT);
            return true;
        });
    }, [registerBackHandler, openApp]);

    // 每个会话的最后一条消息。全局 lastMsgTimestamp 一变就重算（它就是干这个的信号）。
    const reload = useCallback(async () => {
        try {
            const all: any[] = await (DB as any).getRawStoreData('messages');
            const map: Record<string, any> = {};
            for (const m of all || []) {
                if (!m) continue;
                const k = m.groupId ? `g:${m.groupId}` : (m.charId ? `c:${m.charId}` : '');
                if (!k) continue;
                const prev = map[k];
                if (!prev || (m.timestamp || 0) > (prev.timestamp || 0)) map[k] = m;
            }
            setLastByKey(map);
        } catch {
            setLastByKey({});
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void reload(); }, [reload, lastMsgTimestamp, characters.length, groups.length]);

    const rows: ConvRow[] = useMemo(() => {
        const list: ConvRow[] = [];
        for (const c of characters || []) {
            const m = lastByKey[`c:${c.id}`];
            list.push({
                key: `c:${c.id}`,
                kind: 'char',
                id: c.id,
                name: c.name || '未命名',
                avatar: c.avatar || '',
                preview: previewOf(m),
                timestamp: m?.timestamp || 0,
                unread: unreadMessages?.[c.id] || 0,
            });
        }
        for (const g of groups || []) {
            const m = lastByKey[`g:${g.id}`];
            list.push({
                key: `g:${g.id}`,
                kind: 'group',
                id: g.id,
                name: g.name || '群聊',
                avatar: (g as any).avatar || '',
                preview: previewOf(m),
                timestamp: m?.timestamp || 0,
                unread: unreadMessages?.[g.id] || 0,
            });
        }
        return list.sort((a, b) => {
            if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
            return a.name.localeCompare(b.name, 'zh');
        });
    }, [characters, groups, lastByKey, unreadMessages]);

    /** 离开微信去子页面之前统一走这里：留记号 + 换 App。 */
    const leaveTo = (app: AppID) => {
        wechatNav.leave(tab);
        openApp(app);
    };

    const openChar = (id: string) => {
        clearUnread?.(id);
        characterLaunch.request({ charId: id });
        setActiveCharacterId?.(id);
        leaveTo(AppID.Chat);
    };

    const openGroup = (id: string) => {
        clearUnread?.(id);
        groupLaunch.request(id);
        leaveTo(AppID.GroupChat);
    };

    const TabButton: React.FC<{ k: TabKey; label: string; node: React.ReactNode }> = ({ k, label, node }) => (
        <button
            onClick={() => setTab(k)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 transition-colors"
            style={{ color: tab === k ? GREEN : '#8a8a8a' }}
        >
            {node}
            <span className="text-[10px] font-medium">{label}</span>
        </button>
    );

    return (
        <div className="w-full h-full flex flex-col bg-[#ededed]">
            {/* 顶栏：标题居中，右上角加号 —— 照微信 */}
            <div className="shrink-0 flex items-center justify-center relative bg-[#ededed] border-b border-black/5" style={{ paddingTop: 'var(--safe-top)', height: 'calc(44px + var(--safe-top))' }}>
                <span className="text-[17px] font-semibold text-slate-900">
                    {tab === 'chats' ? '微信' : tab === 'contacts' ? '通讯录' : tab === 'moments' ? '朋友圈' : '我'}
                </span>
                <button
                    onClick={() => leaveTo(AppID.Settings)}
                    className="absolute right-3 bottom-2 w-8 h-8 flex items-center justify-center text-slate-700 text-xl leading-none"
                    aria-label="更多"
                >＋</button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain">
                {tab === 'chats' && (
                    <div className="bg-white">
                        {loading && rows.length === 0 && (
                            <div className="py-10 text-center text-xs text-slate-400">正在整理会话…</div>
                        )}
                        {rows.map((r) => (
                            <button
                                key={r.key}
                                onClick={() => (r.kind === 'char' ? openChar(r.id) : openGroup(r.id))}
                                className="w-full flex items-center gap-3 px-3 py-2.5 bg-white active:bg-slate-100 text-left border-b border-slate-100 last:border-b-0"
                            >
                                <Avatar src={r.avatar} name={r.name} badge={r.unread} />
                                <div className="flex-1 min-w-0 flex items-center gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[15px] text-slate-900 truncate">{r.name}</div>
                                        <div className="text-[12px] text-slate-400 truncate h-4">{r.preview}</div>
                                    </div>
                                    <div className="shrink-0 text-[10px] text-slate-400 self-start pt-1">{formatTime(r.timestamp)}</div>
                                </div>
                            </button>
                        ))}
                        {!loading && rows.length === 0 && (
                            <div className="py-16 text-center text-xs text-slate-400">还没有会话</div>
                        )}
                    </div>
                )}

                {tab === 'contacts' && (
                    <div className="p-3 space-y-2">
                        <button onClick={() => leaveTo(AppID.Character)} className="w-full bg-white rounded-xl px-4 py-3 flex items-center justify-between text-left active:bg-slate-100">
                            <span className="text-[15px] text-slate-900">角色列表</span>
                            <span className="text-xs text-slate-400">进去管理 →</span>
                        </button>
                        <div className="bg-white rounded-xl overflow-hidden">
                            {(characters || []).map((c) => (
                                <button key={c.id} onClick={() => openChar(c.id)} className="w-full flex items-center gap-3 px-3 py-2.5 active:bg-slate-100 text-left border-b border-slate-100 last:border-b-0">
                                    <Avatar src={c.avatar} name={c.name} />
                                    <span className="text-[15px] text-slate-900 truncate">{c.name}</span>
                                    {activeCharacterId === c.id && <span className="ml-auto text-[10px] text-slate-400">当前</span>}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {tab === 'moments' && (
                    <div className="p-3">
                        <button onClick={() => leaveTo(AppID.Social)} className="w-full bg-white rounded-xl px-4 py-3 flex items-center justify-between text-left active:bg-slate-100">
                            <span className="text-[15px] text-slate-900">朋友圈动态</span>
                            <span className="text-xs text-slate-400">进去看看 →</span>
                        </button>
                    </div>
                )}

                {tab === 'me' && (
                    <div className="p-3 space-y-3">
                        <div className="bg-white rounded-xl px-4 py-4 flex items-center gap-3">
                            <Avatar src={(userProfile as any)?.avatar} name={(userProfile as any)?.name || '我'} />
                            <div className="min-w-0">
                                <div className="text-[16px] font-semibold text-slate-900 truncate">{(userProfile as any)?.name || '我'}</div>
                                <div className="text-[12px] text-slate-400 truncate">{(userProfile as any)?.bio || ''}</div>
                            </div>
                        </div>
                        <div className="bg-white rounded-xl overflow-hidden">
                            <button onClick={() => leaveTo(AppID.User)} className="w-full px-4 py-3 text-left text-[15px] text-slate-900 active:bg-slate-100 border-b border-slate-100">档案</button>
                            <button onClick={() => leaveTo(AppID.Settings)} className="w-full px-4 py-3 text-left text-[15px] text-slate-900 active:bg-slate-100">设置</button>
                        </div>
                    </div>
                )}
            </div>

            {/* 底部 Tab 栏：自己让位 home 条（见 utils/safeAreaApps.ts） */}
            <div className="shrink-0 flex items-stretch bg-[#f7f7f7] border-t border-black/5" style={{ paddingBottom: 'var(--safe-bottom)' }}>
                <TabButton k="chats" label="消息" node={<ChatTeardrop size={22} weight={tab === 'chats' ? 'fill' : 'regular'} />} />
                <TabButton k="contacts" label="通讯录" node={<UsersThree size={22} weight={tab === 'contacts' ? 'fill' : 'regular'} />} />
                <TabButton k="moments" label="朋友圈" node={<Compass size={22} weight={tab === 'moments' ? 'fill' : 'regular'} />} />
                <TabButton k="me" label="我" node={<UserCircle size={22} weight={tab === 'me' ? 'fill' : 'regular'} />} />
            </div>
        </div>
    );
};

export default WeChat;
