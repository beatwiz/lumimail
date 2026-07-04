"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import dayjs from "dayjs";
import { useTranslations } from "next-intl";
import DOMPurify from "dompurify";
import { MarkAsRead } from "@/components/mark-read";
import { MessageActions } from "@/components/message-actions/message-actions";
import { AttachmentList } from "@/components/messages/attachment-list";
import { getMessageBackHref } from "@/components/message-actions/utils";
import { authFetch } from "@/lib/auth/client";
import { getDisplayNameForAddress } from "@/lib/contacts/utils";
import { getEmailAddress } from "@/lib/email/address";
import type { Message } from "@/hooks/types";
import type { MessageDetailResponse } from "./types";
import { fetchMessageDetail, getMessageBodyDisplay, getMessageHeaderParties } from "./utils";

type ThreadMessage = Message & {
	textBody: string | null;
	htmlBody: string | null;
};

type ThreadResponse = {
	messages: ThreadMessage[];
};

function ThreadItem({
	msg,
	isExpanded,
	isCurrent,
	onToggle,
}: {
	msg: ThreadMessage;
	isExpanded: boolean;
	isCurrent: boolean;
	onToggle: () => void;
}) {
	const fromName = getDisplayNameForAddress(msg.fromAddr, null);
	const fromAddress = getEmailAddress(msg.fromAddr);
	const bodyDisplay = getMessageBodyDisplay(msg.textBody, msg.htmlBody, msg.snippet);

	return (
		<div
			className={`border border-[var(--border)] rounded-lg overflow-hidden transition-all duration-200 ${isCurrent ? "ring-2 ring-[var(--border-strong)]" : ""}`}
		>
			<button
				type="button"
				onClick={onToggle}
				className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--surface-subtle)] transition-colors"
			>
				<div className="flex items-center gap-3 min-w-0">
					<div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--surface-subtle)] flex items-center justify-center text-xs font-medium text-[var(--ink-muted)]">
						{(fromName || fromAddress).slice(0, 1).toUpperCase()}
					</div>
					<div className="min-w-0">
						<p className="text-sm font-medium text-[var(--ink)] truncate">
							{fromName || fromAddress}
							{fromName && (
								<span className="ml-1 font-normal text-[var(--ink-muted)]">&lt;{fromAddress}&gt;</span>
							)}
						</p>
						{!isExpanded && (
							<p className="text-xs text-[var(--ink-muted)] truncate">{msg.snippet ?? ""}</p>
						)}
					</div>
				</div>
				<div className="flex items-center gap-3 flex-shrink-0 ml-4">
					<span className="text-xs text-[var(--ink-faint)]">
						{dayjs(msg.createdAt).format("MMM DD, hh:mmA")}
					</span>
					<ChevronDown
						className={`h-4 w-4 text-[var(--ink-faint)] transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
					/>
				</div>
			</button>

			<div
				className={`transition-all duration-200 ease-in-out ${isExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0 overflow-hidden"}`}
			>
				<div className="px-4 pb-4 pt-0 border-t border-[var(--border)]">
					<div className="prose max-w-none text-[var(--ink)] mt-3">
						{bodyDisplay.htmlBody ? (
							<div
								dangerouslySetInnerHTML={{
									__html: DOMPurify.sanitize(bodyDisplay.htmlBody),
								}}
							/>
						) : (
							<pre className="whitespace-pre-wrap text-sm">{bodyDisplay.latestContent}</pre>
						)}
						{bodyDisplay.quotedContent.map((quotedContent) => (
							<blockquote
								key={`${quotedContent.dateLine}-${quotedContent.content.slice(0, 24)}`}
								className="mt-4 border-l-2 border-[var(--border-strong)] pl-4 text-[var(--ink-muted)]"
							>
								<p className="mb-2 text-xs font-medium text-[var(--ink-faint)]">
									{quotedContent.dateLine}
								</p>
								<pre className="whitespace-pre-wrap text-sm font-sans">
									{quotedContent.content}
								</pre>
							</blockquote>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

export default function MessageDetailPage() {
	const t = useTranslations("messages");
	const params = useParams<{ messageId: string }>();
	const messageId = params.messageId;
	const [data, setData] = useState<MessageDetailResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
	const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

	useEffect(() => {
		let cancelled = false;

		async function loadMessage() {
			setLoading(true);
			const nextData = await fetchMessageDetail(messageId);
			if (!cancelled) {
				setData(nextData);
				setLoading(false);

				if (nextData.message?.threadId) {
					const threadRes = await authFetch(
						`/api/messages/thread/${encodeURIComponent(nextData.message.threadId)}`,
					);
					if (!cancelled && threadRes.ok) {
						const threadData = (await threadRes.json()) as ThreadResponse;
						if (threadData.messages && threadData.messages.length > 1) {
							setThreadMessages(threadData.messages);
							// Expand the current message by default
							setExpandedIds(new Set([messageId]));
						}
					}
				}
			}
		}

		void loadMessage();
		return () => {
			cancelled = true;
		};
	}, [messageId]);

	function toggleExpanded(id: string) {
		setExpandedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}

	if (loading) {
		return <p className="px-6 py-4 text-sm text-[var(--ink-muted)]">{t("loading")}</p>;
	}

	if (!data?.message) {
		return <p className="px-6 py-4 text-sm text-[var(--ink-muted)]">{data?.error ?? t("messageNotFound")}</p>;
	}

	const { message, body } = data;
	const { fromName, fromAddress, toName } = getMessageHeaderParties(message);
	const bodyDisplay = getMessageBodyDisplay(body?.textBody, body?.htmlBody, message.snippet);

	const showThread = threadMessages.length > 1;

	return (
		<div className="h-full overflow-auto">
			{message.direction === "inbound" && !message.read && (
				<MarkAsRead messageId={message.id} />
			)}
			<div className="flex py-2 items-center justify-between px-2">
				<div className="flex items-center flex-row gap-6">
					<Link
						href={getMessageBackHref(message.direction, message.status)}
						className="rounded-full p-2 text-[var(--ink-muted)] hover:bg-[var(--surface-subtle)]"
					>
						<ArrowLeft className="h-5 w-5" />
					</Link>
				</div>
				<MessageActions
					messageId={message.id}
					direction={message.direction}
					status={message.status}
					read={message.read}
					fromAddr={message.fromAddr}
					toAddr={message.toAddr}
					subject={message.subject}
				/>
			</div>
			<article className="px-6">
				<h1 className="text-2xl text-[var(--ink)] mb-4">
					{message.subject ?? t("noSubject")}
				</h1>

				{showThread ? (
					<div className="flex flex-col gap-2 mb-4">
						<p className="text-xs text-[var(--ink-faint)] mb-1">
							{threadMessages.length} messages in thread
						</p>
						{threadMessages.map((msg) => (
							<ThreadItem
								key={msg.id}
								msg={msg}
								isExpanded={expandedIds.has(msg.id)}
								isCurrent={msg.id === messageId}
								onToggle={() => toggleExpanded(msg.id)}
							/>
						))}
					</div>
				) : (
					<>
						<div className="mb-6 flex items-start justify-between border-b border-[var(--border)] pb-5">
							<div>
								<p className="text-sm text-[var(--ink)]">
									<b>{fromName}</b> <span className="text-[var(--ink-muted)]">&lt;{fromAddress}&gt;</span>
								</p>
								<p className="text-xs text-[var(--ink-muted)]">
									{t("toRecipient", { name: toName })}
								</p>
							</div>
							<p className="text-xs text-[var(--ink-faint)]">
								{dayjs(message.createdAt).format("MMM DD, YYYY, hh:mmA")}
							</p>
						</div>
						<div className="prose max-w-none text-[var(--ink)]">
							{bodyDisplay.htmlBody ? (
								<div dangerouslySetInnerHTML={{ __html: bodyDisplay.htmlBody }} />
							) : (
								<pre className="whitespace-pre-wrap text-sm">
									{bodyDisplay.latestContent}
								</pre>
							)}
							{bodyDisplay.quotedContent.map((quotedContent) => (
								<blockquote
									key={`${quotedContent.dateLine}-${quotedContent.content.slice(0, 24)}`}
									className="mt-6 border-l-2 border-[var(--border-strong)] pl-4 text-[var(--ink-muted)]"
								>
									<p className="mb-3 text-xs font-medium text-[var(--ink-faint)]">
										{quotedContent.dateLine}
									</p>
									<pre className="whitespace-pre-wrap text-sm font-sans">
										{quotedContent.content}
									</pre>
								</blockquote>
							))}
						</div>
					</>
				)}

				<AttachmentList messageId={message.id} />
			</article>
		</div>
	);
}
