"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, DoorClosed, EyeOff, Grid2X2, MessageCircle, PawPrint, RefreshCw, Search, ShieldCheck, Store, Users, X } from "lucide-react";
import { AccountError, accountDate, accountErrorMessage, adminFetch, isAccountAccessError, type AccountUser, type AdminMember, type AdminMembers, type AdminMessage, type AdminOverview, type AdminPage, type AdminRoom } from "@/lib/account";
import { AccountAccess, AccountFailure, AccountLoading, AccountNotice } from "./account-ui";
import { AdminActionDialog, type AdminAction } from "./admin-action-dialog";
import { AdminDogStyles } from "./admin-dog-styles";
import { AdminCommerce } from "../commerce/admin-commerce";
import { useAccountSession } from "./use-account-session";

export function AdminDashboard() {
  const { session, loading, error, unauthorized, forbidden, refresh } = useAccountSession();
  if (loading) return <AccountLoading label="관리자 권한을 확인하고 있어요." />;
  if (unauthorized || (!error && !session?.user)) return <AccountAccess />;
  if (forbidden || session?.user?.status === "SUSPENDED") return <AccountAccess forbidden />;
  if (error) return <AccountFailure message={accountErrorMessage(error)} retry={refresh} />;
  if (!session?.user) return <AccountAccess />;
  if (session.user.role !== "ADMIN") return <AccountAccess forbidden />;
  if (!session.user.emailVerified) return (
    <section className="account-card account-state">
      <h1>이메일 인증이 필요해요</h1>
      <p>관리자 화면에 들어오기 전에 내 이메일을 인증해 주세요.</p>
      <Link href="/account/me" className="account-button">마이페이지에서 인증하기</Link>
    </section>
  );
  return <AdminConsole user={session.user} />;
}

function useAdminResource<T>(path: string | null, revision: number, onAccessError: (problem: unknown) => void) {
  const [resource, setResource] = useState<{ path: string | null; data: T | null; loading: boolean; error: string }>({ path: null, data: null, loading: false, error: "" });
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    setResource({ path, data: null, loading: !!path, error: "" });
    if (!path) return;
    adminFetch<T>(path, undefined, controller.signal)
      .then(result => { if (!disposed) setResource({ path, data: result, loading: false, error: "" }); })
      .catch(problem => {
        if (disposed) return;
        if (isAccountAccessError(problem)) onAccessError(problem);
        else setResource({ path, data: null, loading: false, error: accountErrorMessage(problem) });
      });
    return () => { disposed = true; controller.abort(); };
  }, [path, revision, onAccessError]);
  return resource.path === path ? resource : { path, data: null, loading: !!path, error: "" };
}

function AdminConsole({ user }: { user: AccountUser }) {
  const [tab, setTab] = useState<"members" | "rooms" | "styles" | "commerce">("members");
  const [stylesOpened, setStylesOpened] = useState(false);
  const [commerceOpened, setCommerceOpened] = useState(false);
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selectedRoom, setSelectedRoom] = useState<AdminRoom | null>(null);
  const [roomPage, setRoomPage] = useState(0);
  const [messagePage, setMessagePage] = useState(0);
  const [action, setAction] = useState<AdminAction | null>(null);
  const [notice, setNotice] = useState("");
  const [accessError, setAccessError] = useState<AccountError | null>(null);
  const onAccessError = useCallback((problem: unknown) => {
    if (problem instanceof AccountError) setAccessError(problem);
  }, []);
  const overview = useAdminResource<AdminOverview>("overview", revision, onAccessError);
  const members = useAdminResource<AdminMembers>(tab === "members" ? `members?page=${page}&query=${encodeURIComponent(query)}` : null, revision, onAccessError);
  const rooms = useAdminResource<AdminPage<AdminRoom>>(tab === "rooms" ? `rooms?page=${roomPage}` : null, revision, onAccessError);
  const messages = useAdminResource<AdminPage<AdminMessage>>(tab === "rooms" && selectedRoom ? `rooms/${encodeURIComponent(selectedRoom.id)}/messages?page=${messagePage}` : null, revision, onAccessError);
  const reload = () => setRevision(value => value + 1);

  function searchMembers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(search.trim());
    setPage(0);
    reload();
  }

  function changeMember(member: AdminMember) {
    const suspend = member.status === "ACTIVE";
    setNotice("");
    setAction({
      path: `members/${encodeURIComponent(member.id)}/status`,
      title: suspend ? "회원 이용을 정지할까요?" : "회원 이용을 다시 허용할까요?",
      target: `${member.displayName}${member.email ? ` · ${member.email}` : ""}`,
      impact: suspend ? "이 회원은 서비스를 이용할 수 없게 돼요. 정지를 해제하면 다시 이용할 수 있어요." : "이 회원의 이용 제한을 해제해요. 다시 로그인하고 서비스를 이용할 수 있어요.",
      confirmLabel: suspend ? "이용 정지" : "정지 해제",
      payload: { status: suspend ? "SUSPENDED" : "ACTIVE" },
      destructive: suspend,
    });
  }

  function closeRoom(room: AdminRoom) {
    setNotice("");
    setAction({
      path: `rooms/${encodeURIComponent(room.id)}/close`,
      title: "산책방을 폐쇄할까요?",
      target: room.title,
      impact: `현재 참여 인원은 ${room.memberCount}명이에요. 이 산책방에서 더 이상 함께 산책하거나 대화할 수 없게 돼요.`,
      confirmLabel: "산책방 폐쇄",
      destructive: true,
    });
  }

  function hideMessage(message: AdminMessage) {
    setNotice("");
    setAction({
      path: `messages/${encodeURIComponent(message.id)}/hide`,
      title: "이 메시지를 숨길까요?",
      target: `${message.authorLabel}: ${message.text}`,
      impact: "선택한 메시지가 산책방에 보이지 않게 돼요. 메시지 내용과 작성자를 한 번 더 확인해 주세요.",
      confirmLabel: "메시지 숨김",
      destructive: true,
    });
  }

  function completeAction(message: string) {
    if (action?.path.endsWith("/close")) setSelectedRoom(null);
    setAction(null);
    setNotice(message);
    reload();
  }

  if (accessError) return <AccountAccess forbidden={accessError.status === 403} />;

  return (
    <div className="admin-dashboard">
      <div className="account-page-heading">
        <div><span className="account-kicker"><ShieldCheck size={13} aria-hidden="true" /> PUPPYRUBY ADMIN</span><h1>함께 지키는 작은 마을</h1><p>회원과 산책방을 살펴보고 편안한 하루를 지켜요.</p></div>
        <div className="account-heading-actions">
          <Link href="/account/me" className="account-text-link"><ArrowLeft size={14} aria-hidden="true" /> 마이페이지</Link>
          {(tab === "members" || tab === "rooms") && <button type="button" className="account-button account-button-soft" onClick={reload}><RefreshCw size={15} aria-hidden="true" /> 새로고침</button>}
        </div>
      </div>
      <AccountNotice kind="success">{notice}</AccountNotice>
      <section aria-label="서비스 현황" className="admin-overview-section">
        {overview.loading ? <AccountLoading label="서비스 현황을 불러오고 있어요." /> : overview.error ? <AccountFailure message={overview.error} retry={reload} /> : overview.data && <div className="admin-stat-grid">
          <Stat label="전체 회원" value={overview.data.members} icon="users" />
          <Stat label="이용 중인 회원" value={overview.data.activeMembers} icon="users" />
          <Stat label="정지된 회원" value={overview.data.suspendedMembers} icon="users" />
          <Stat label="함께하는 강아지" value={overview.data.puppies} icon="puppies" />
          <Stat label="열린 산책방" value={overview.data.rooms} icon="rooms" />
          <Stat label="산책방 메시지" value={overview.data.messages} icon="messages" />
        </div>}
      </section>

      <nav className="account-tabs admin-tabs admin-tabs-with-styles admin-tabs-with-commerce" aria-label="관리 항목">
        <button type="button" aria-pressed={tab === "members"} onClick={() => { setTab("members"); setSelectedRoom(null); }}><Users size={16} aria-hidden="true" /> 회원 관리</button>
        <button type="button" aria-pressed={tab === "rooms"} onClick={() => setTab("rooms")}><MessageCircle size={16} aria-hidden="true" /> 산책방 관리</button>
        <button type="button" aria-pressed={tab === "styles"} onClick={() => { setStylesOpened(true); setTab("styles"); }}><Grid2X2 size={16} aria-hidden="true" /> 도트 스타일</button>
        <button type="button" aria-pressed={tab === "commerce"} onClick={() => { setCommerceOpened(true); setTab("commerce"); }}><Store size={16} aria-hidden="true" /> 뽑기·상품</button>
      </nav>

      {tab === "members" ? (
        <section className="account-card admin-members" aria-labelledby="admin-members-heading">
          <div className="account-section-heading"><div><h2 id="admin-members-heading">회원 관리</h2><p>이메일이나 별명으로 회원을 찾아요.</p></div>{members.data && <span className="account-badge">{members.data.totalElements.toLocaleString()}명</span>}</div>
          <form className="admin-search" onSubmit={searchMembers}>
            <label className="account-field" htmlFor="admin-member-query">
              <span className="account-sr-only">회원 이메일 또는 별명 검색</span>
              <input id="admin-member-query" name="query" value={search} onChange={event => setSearch(event.target.value)} maxLength={254} placeholder="이메일 또는 별명" type="search" />
            </label>
            <button type="submit" className="account-button account-button-soft"><Search size={16} aria-hidden="true" /> 검색</button>
          </form>
          {members.loading ? <AccountLoading label="회원을 찾고 있어요." /> : members.error ? <AccountFailure message={members.error} retry={reload} /> : members.data && <>
            {members.data.items.length ? <div className="admin-table-wrap"><table className="admin-member-table">
              <caption className="account-sr-only">회원 목록. {members.data.page + 1}페이지, 전체 {members.data.totalElements}명</caption>
              <thead><tr><th scope="col">회원</th><th scope="col">상태</th><th scope="col">강아지</th><th scope="col">가입일</th><th scope="col">관리</th></tr></thead>
              <tbody>{members.data.items.map(member => <tr key={member.id}>
                <th scope="row"><strong>{member.displayName}</strong><span>{member.email || "이메일 정보 없음"}</span><small>{member.role === "ADMIN" ? "관리자" : "회원"} · {member.emailVerified ? "이메일 인증됨" : "이메일 미인증"}</small></th>
                <td data-label="상태"><span className={`account-badge ${member.status === "ACTIVE" ? "account-badge-green" : "account-badge-red"}`}>{member.status === "ACTIVE" ? "이용 중" : "정지됨"}</span></td>
                <td data-label="강아지">{member.puppyCount}마리</td>
                <td data-label="가입일">{accountDate(member.createdAt)}</td>
                <td data-label="관리">{member.role === "ADMIN" ? (
                  <span className="account-small-note">{member.id === user.id ? "내 계정" : "관리자 계정"}</span>
                ) : (
                  <button
                    type="button" className={`admin-row-button${member.status === "ACTIVE" ? " admin-row-button-danger" : ""}`}
                    onClick={() => changeMember(member)}
                    aria-label={`${member.displayName}님 ${member.status === "ACTIVE" ? "이용 정지" : "정지 해제"}`}
                  >{member.status === "ACTIVE" ? "이용 정지" : "정지 해제"}</button>
                )}</td>
              </tr>)}</tbody>
            </table></div> : <p className="account-empty">{query ? "검색 결과가 없어요. 다른 이메일이나 별명으로 찾아보세요." : "아직 가입한 회원이 없어요."}</p>}
            <div className="admin-pagination" aria-label="회원 목록 페이지 이동">
              <button type="button" className="account-button account-button-soft" disabled={page <= 0} onClick={() => setPage(value => Math.max(0, value - 1))}><ChevronLeft size={15} aria-hidden="true" /> 이전</button>
              <span>{members.data.totalPages ? `${members.data.page + 1} / ${members.data.totalPages}` : "0 / 0"}</span>
              <button type="button" className="account-button account-button-soft" disabled={page + 1 >= members.data.totalPages} onClick={() => setPage(value => value + 1)}>다음 <ChevronRight size={15} aria-hidden="true" /></button>
            </div>
          </>}
        </section>
      ) : tab === "rooms" ? (
        <section className="admin-rooms-layout" aria-label="산책방과 메시지 관리">
          <div className="account-card admin-rooms">
            <div className="account-section-heading"><div><h2>산책방 관리</h2><p>열린 방의 참여 현황과 대화를 확인해요.</p></div></div>
            {rooms.loading ? <AccountLoading label="산책방을 불러오고 있어요." /> : rooms.error ? <AccountFailure message={rooms.error} retry={reload} /> : rooms.data && <div className="admin-room-list">
              {rooms.data.items.length ? rooms.data.items.map(room => <article className={`admin-room-card${selectedRoom?.id === room.id ? " admin-room-selected" : ""}`} key={room.id}>
                <div><h3>{room.title}</h3><p>방장 {room.ownerLabel}</p><span>{room.memberCount}명 참여 · 메시지 {room.messageCount}개 · {accountDate(room.createdAt)}</span></div>
                <div className="admin-room-actions">
                  <button type="button" className="admin-row-button" onClick={() => { setSelectedRoom(room); setMessagePage(0); }} aria-pressed={selectedRoom?.id === room.id}>
                    <MessageCircle size={14} aria-hidden="true" /> 대화 보기
                  </button>
                  <button type="button" className="admin-row-button admin-row-button-danger" onClick={() => closeRoom(room)} aria-label={`${room.title} 산책방 폐쇄`}>
                    <DoorClosed size={14} aria-hidden="true" /> 방 폐쇄
                  </button>
                </div>
              </article>) : <p className="account-empty">현재 열려 있는 산책방이 없어요.</p>}
            </div>}
            {rooms.data && <AdminPagination label="산책방 목록" page={rooms.data.page} totalElements={rooms.data.totalElements} pageSize={50} setPage={next => { setRoomPage(next); setSelectedRoom(null); setMessagePage(0); }} />}
          </div>
          <section className="account-card admin-messages" aria-labelledby="admin-message-heading">
            <div className="account-section-heading">
              <div>
                <h2 id="admin-message-heading">{selectedRoom ? selectedRoom.title : "산책방 대화"}</h2>
                <p>{selectedRoom ? "메시지를 확인하고 필요한 경우 숨길 수 있어요." : "산책방을 선택하면 대화가 여기에 보여요."}</p>
              </div>
              {selectedRoom && <button type="button" className="admin-dialog-close" aria-label="산책방 대화 닫기" onClick={() => setSelectedRoom(null)}><X size={18} aria-hidden="true" /></button>}
            </div>
            {!selectedRoom ? (
              <div className="account-empty"><MessageCircle size={30} aria-hidden="true" /><p>산책방의 ‘대화 보기’를 선택해 주세요.</p></div>
            ) : messages.loading ? <AccountLoading label="대화를 불러오고 있어요." />
              : messages.error ? <AccountFailure message={messages.error} retry={reload} />
                : messages.data && <div className="admin-message-list">
              {messages.data.items.length ? messages.data.items.map(message => <article className="admin-message" key={message.id}>
                <div><strong>{message.authorLabel}</strong><time dateTime={new Date(message.createdAt).toISOString()}>{accountDate(message.createdAt)}</time></div>
                <p>{message.text}</p>
                <button type="button" className="admin-row-button admin-row-button-danger" onClick={() => hideMessage(message)} aria-label={`${message.authorLabel}님의 메시지 숨김`}><EyeOff size={13} aria-hidden="true" /> 메시지 숨김</button>
              </article>) : <p className="account-empty">표시할 메시지가 없어요.</p>}
            </div>}
            {selectedRoom && messages.data && <AdminPagination label="산책방 메시지" page={messages.data.page} totalElements={messages.data.totalElements} pageSize={100} setPage={setMessagePage} />}
          </section>
        </section>
      ) : null}
      {stylesOpened && <div hidden={tab !== "styles"}><AdminDogStyles onAccessError={onAccessError} /></div>}
      {commerceOpened && <div hidden={tab !== "commerce"}><AdminCommerce onAccessError={onAccessError} /></div>}
      {action && <AdminActionDialog action={action} onClose={() => setAction(null)} onComplete={completeAction} onAccessError={onAccessError} />}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: "users" | "puppies" | "rooms" | "messages" }) {
  const Icon = icon === "puppies" ? PawPrint : icon === "rooms" ? DoorClosed : icon === "messages" ? MessageCircle : Users;
  return (
    <article className="admin-stat">
      <span><Icon size={17} aria-hidden="true" />{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </article>
  );
}

function AdminPagination({ label, page, totalElements, pageSize, setPage }: { label: string; page: number; totalElements: number; pageSize: number; setPage: (page: number) => void }) {
  const totalPages = Math.ceil(totalElements / pageSize);
  return (
    <div className="admin-pagination" aria-label={`${label} 페이지 이동`}>
      <button type="button" className="account-button account-button-soft" disabled={page <= 0} onClick={() => setPage(Math.max(0, page - 1))}><ChevronLeft size={15} aria-hidden="true" /> 이전</button>
      <span>{totalPages ? `${page + 1} / ${totalPages}` : "0 / 0"}</span>
      <button type="button" className="account-button account-button-soft" disabled={page + 1 >= totalPages} onClick={() => setPage(page + 1)}>다음 <ChevronRight size={15} aria-hidden="true" /></button>
    </div>
  );
}
