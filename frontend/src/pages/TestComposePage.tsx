import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCcw, Send } from "lucide-react";
import { useNotification } from "@/context/NotificationContext";
import { useSelectionContext } from "@/context/SelectionContext";
import {
  generateTestComposeDraft,
  getTestComposeThread,
  saveTestComposeDraft,
  sendTestComposeMessage,
} from "@/lib/api/testComposeApi";
import { MATERIAL_TYPE_LABELS, type TestComposeThreadDTO } from "@/types";

export const TestComposePage = () => {
  const { selectedIdentityId, selectedLlmProfileId } = useSelectionContext();
  const { notifyError, notifySuccess } = useNotification();
  const [thread, setThread] = useState<TestComposeThreadDTO | null>(null);
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);

  const syncDraft = useCallback((nextThread: TestComposeThreadDTO) => {
    setThread(nextThread);
    setSubject(nextThread.draft.subject ?? "");
    setBodyText(nextThread.draft.body_text);
    setSelectedMaterialIds(nextThread.draft.selected_material_ids);
  }, []);

  const loadThread = useCallback(async () => {
    if (!selectedIdentityId || !selectedLlmProfileId) {
      setThread(null);
      return;
    }

    setLoading(true);
    try {
      const nextThread = await getTestComposeThread(selectedIdentityId, selectedLlmProfileId);
      syncDraft(nextThread);
    } catch (error) {
      const message = error instanceof Error ? error.message : "加载测试写信页失败";
      notifyError("加载测试写信页失败", message);
    } finally {
      setLoading(false);
    }
  }, [notifyError, selectedIdentityId, selectedLlmProfileId, syncDraft]);

  useEffect(() => {
    void loadThread();
  }, [loadThread]);

  const runAction = useCallback(
    async (action: () => Promise<TestComposeThreadDTO>, successTitle?: string) => {
      setActing(true);
      try {
        const nextThread = await action();
        syncDraft(nextThread);
        if (successTitle) {
          notifySuccess(successTitle, "已更新测试写信内容。");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "测试写信操作失败";
        notifyError("测试写信操作失败", message);
      } finally {
        setActing(false);
      }
    },
    [notifyError, notifySuccess, syncDraft],
  );

  const selectedMaterialSet = useMemo(() => new Set(selectedMaterialIds), [selectedMaterialIds]);

  if (!selectedIdentityId || !selectedLlmProfileId) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="rounded-3xl border border-dashed border-stone-300 bg-[#fcfbf8] p-10 text-center">
          <h1 className="text-2xl font-semibold text-stone-900">先选择身份和模型</h1>
          <p className="mt-3 text-sm text-stone-600">测试写信页会使用你当前选择的身份和模型。</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <section className="rounded-3xl border border-stone-200 bg-[#fcfbf8] p-6 shadow-sm">
        <h1 className="text-3xl font-semibold text-stone-900">测试写信页</h1>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          这里会把测试邮件真实发到你当前身份自己的邮箱，用来确认模板、附件和 SMTP 效果。
        </p>
      </section>

      {loading || !thread ? (
        <div className="mt-6 flex items-center justify-center gap-2 rounded-3xl border border-stone-200 bg-white px-6 py-14 text-sm text-stone-500 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载测试写信页...
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr,0.9fr]">
          <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-stone-900">测试内容</h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  收件人固定为 {thread.identity.email_address}，可以先生成草稿，再手动调整后发送。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void runAction(
                      () => generateTestComposeDraft(selectedIdentityId, selectedLlmProfileId),
                      "已生成测试草稿",
                    )
                  }
                  disabled={acting}
                  className="ui-btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCcw className="h-4 w-4" />
                  生成测试草稿
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void runAction(
                      () =>
                        sendTestComposeMessage(selectedIdentityId, selectedLlmProfileId, {
                          subject: subject.trim() || null,
                          body_text: bodyText,
                          body_html: thread.draft.body_html,
                          selected_material_ids: selectedMaterialIds,
                        }),
                      "测试邮件已发送",
                    )
                  }
                  disabled={acting}
                  className="ui-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                  发送测试邮件
                </button>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <label className="block">
                <div className="mb-2 text-sm font-medium text-stone-800">邮件主题</div>
                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  className="form-input"
                />
              </label>
              <label className="block">
                <div className="mb-2 text-sm font-medium text-stone-800">邮件正文</div>
                <textarea
                  value={bodyText}
                  onChange={(event) => setBodyText(event.target.value)}
                  className="min-h-[320px] w-full rounded-[28px] border border-stone-200 bg-white px-4 py-4 text-sm leading-7 text-stone-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  void runAction(
                    () =>
                      saveTestComposeDraft(selectedIdentityId, selectedLlmProfileId, {
                        subject: subject.trim() || null,
                        body_text: bodyText,
                        body_html: thread.draft.body_html,
                        selected_material_ids: selectedMaterialIds,
                      }),
                    "已保存测试草稿",
                  )
                }
                disabled={acting}
                className="ui-btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                保存草稿
              </button>
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-stone-900">当前上下文</h2>
              <div className="mt-4 space-y-2 text-sm text-stone-600">
                <div>身份：{thread.identity.name}</div>
                <div>邮箱：{thread.identity.email_address}</div>
                <div>模型：{thread.llm_profile.name}</div>
              </div>
            </div>

            <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-stone-900">随信附件</h2>
              <div className="mt-4 space-y-2">
                {thread.material_options.length === 0 ? (
                  <div className="text-sm text-stone-500">当前身份还没有可发送的材料。</div>
                ) : (
                  thread.material_options.map((material) => {
                    const checked = selectedMaterialSet.has(material.id);
                    return (
                      <label
                        key={material.id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 px-3 py-3 text-sm text-stone-700"
                      >
                        <span>
                          <span className="block font-medium">{material.display_name}</span>
                          <span className="mt-1 block text-xs text-stone-500">
                            {MATERIAL_TYPE_LABELS[material.material_type]}
                          </span>
                        </span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelectedMaterialIds((previous) =>
                              checked
                                ? previous.filter((item) => item !== material.id)
                                : [...previous, material.id],
                            );
                          }}
                        />
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-stone-900">发送历史</h2>
              <div className="mt-4 space-y-3">
                {thread.history.length === 0 ? (
                  <div className="text-sm text-stone-500">还没有测试发送记录。</div>
                ) : (
                  thread.history.map((message) => (
                    <div
                      key={message.id}
                      className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 text-sm text-stone-700"
                    >
                      <div className="font-medium">{message.subject ?? "未命名测试邮件"}</div>
                      <div className="mt-1 text-xs text-stone-500">{message.recipient_email}</div>
                      <div className="mt-2 text-xs text-stone-500">状态：{message.status}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
};
