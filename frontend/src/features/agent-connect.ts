import { request } from '../api';
import { element, keyed, text } from '../ui/dom';
import { icon } from '../ui/icons';
import { t } from '../i18n';
import '../styles/agent-connect.css';

/**
 * Agent Connect (left panel, Agents rail mode): MCP on/off, client cards for Claude Code, Codex and Cursor,
 * approvals (destructive agent calls, release review), the current identity and a live activity feed with
 * the channel (human, agent, terminal) of every change. All rows are keyed; polling only updates text.
 */
type Client = { id: string; name: string; file: string; status: 'ready' | 'changed' | 'missing'; cliFound: boolean; cli: string; start: string };
type Activity = { id: string; operation: string; identity: string; channel: string; details: Record<string, unknown>; createdAt: string };
type Approval = { id: string; kind: string; subject: Record<string, string>; requestedBy: { name: string; channel: string }; status: string; createdAt: string };
type Settings = { agentDestructive: boolean; publishReview: boolean };

const CLIENT_PRESET: Record<string, string> = { 'claude-code': 'claude', codex: 'codex', cursor: 'cursor' };
const STATUS_TEXT: Record<Client['status'], string> = { ready: 'Project config ready', changed: 'Config edited by hand', missing: 'Config missing' };

export class AgentConnect {
  readonly element = element('div', 'fw-ac');
  private mcpState = element('span', 'fw-ac-state');
  private mcpNote = element('p', 'fw-ac-note');
  private mcpButton = element('button', 'fw-ac-switch');
  private clientList = element('div', 'fw-ac-list');
  private destructive = element('input');
  private review = element('input');
  private approvalList = element('div', 'fw-ac-list');
  private approvalEmpty = element('p', 'fw-ac-note', 'Nothing is waiting for you.');
  private who = element('p', 'fw-ac-note');
  private feed = element('div', 'fw-ac-feed');
  private feedEmpty = element('p', 'fw-ac-note', 'No activity yet.');
  private timer = 0;
  private enabled = false;

  constructor(private hooks: { toggleAgents: () => Promise<void>; launch: (preset: string) => void; notify: (message: string, error?: boolean) => void }) {
    this.mcpButton.type = 'button';
    this.mcpButton.dataset.command = 'agents.toggle';
    this.mcpButton.setAttribute('role', 'switch');
    this.mcpButton.addEventListener('click', () => void this.guard(this.hooks.toggleAgents));
    const mcpRow = element('div', 'fw-ac-row');
    mcpRow.append(icon('bolt'), this.mcpState, element('span', 'fw-ac-grow'), this.mcpButton);
    this.section('MCP access', mcpRow, this.mcpNote);

    this.section('Clients', this.clientList, element('p', 'fw-ac-note', 'Open starts a client in the dock below. Claude Code gets FormWeb\'s tools automatically and needs no setup or Agents switch. Codex and Cursor read the project file, which starts ./formweb mcp and needs Agents on.'));

    this.destructive.type = 'checkbox';
    this.destructive.dataset.field = 'approvals.agentDestructive';
    this.review.type = 'checkbox';
    this.review.dataset.field = 'approvals.publishReview';
    const destructiveLabel = element('label', 'checkbox-field');
    destructiveLabel.append(this.destructive, element('span', '', 'Ask me before an agent deletes, replaces the open project or changes retention'));
    const reviewLabel = element('label', 'checkbox-field');
    reviewLabel.append(this.review, element('span', '', 'A reviewer must approve a release before it goes live'));
    this.destructive.addEventListener('change', () => void this.guard(() => this.saveSettings({ agentDestructive: this.destructive.checked })));
    this.review.addEventListener('change', () => void this.guard(() => this.saveSettings({ publishReview: this.review.checked })));
    this.section('Approvals', destructiveLabel, reviewLabel, this.approvalList, this.approvalEmpty);

    this.section('You', this.who);
    this.section('Activity', this.feed, this.feedEmpty);
  }

  private section(title: string, ...children: HTMLElement[]): void {
    const wrap = element('section', 'fw-ac-section');
    wrap.append(element('h3', 'fw-ac-title', title), ...children);
    this.element.append(wrap);
  }

  private async guard(action: () => Promise<unknown>): Promise<void> {
    try { await action(); await this.refresh(); } catch (error) { this.hooks.notify(error instanceof Error ? error.message : String(error), true); }
  }

  setAgents(enabled: boolean): void {
    this.enabled = enabled;
    text(this.mcpState, enabled ? 'Agents on' : 'Agents off');
    text(this.mcpButton, enabled ? 'Turn off' : 'Turn on');
    this.mcpButton.setAttribute('aria-checked', String(enabled));
    this.mcpButton.classList.toggle('is-on', enabled);
    text(this.mcpNote, enabled ? 'Outside MCP clients can change this site. Every change shows in Activity with who made it.' : 'Outside MCP clients are blocked. Claude Code and Chat opened from this editor still work. Turn on to let Codex, Cursor or a Claude Code you start yourself connect.');
  }

  /** Start or stop live polling; only polls while the panel is visible. */
  setVisible(visible: boolean): void {
    if (visible === !!this.timer) return;
    window.clearInterval(this.timer);
    this.timer = 0;
    if (!visible) return;
    void this.refresh();
    this.timer = window.setInterval(() => void this.refresh(), 2000);
  }

  async refresh(): Promise<void> {
    const [clients, approvals, activity] = await Promise.all([
      request<{ clients: Client[]; agentsEnabled: boolean; access: { identity: { name: string }; role: string; permissions: string[] } }>('/api/agents/clients'),
      request<{ settings: Settings; approvals: Approval[] }>('/api/approvals?status=pending'),
      request<{ activity: Activity[] }>('/api/substrate/activity?limit=40')
    ]);
    this.setAgents(clients.agentsEnabled);
    keyed(this.clientList, clients.clients, item => item.id, item => this.clientCard(item), (node, item) => {
      text(node.querySelector('.fw-ac-chip')!, STATUS_TEXT[item.status]);
      (node.querySelector('.fw-ac-chip') as HTMLElement).dataset.status = item.status;
      text(node.querySelector('.fw-ac-sub')!, `${item.file} · ${item.cliFound ? t('{0} found', [item.cli]) : t('{0} not found', [item.cli])}`);
      (node.querySelector('[data-action="write"]') as HTMLButtonElement).hidden = item.status === 'ready';
    });
    if (document.activeElement !== this.destructive) this.destructive.checked = approvals.settings.agentDestructive;
    if (document.activeElement !== this.review) this.review.checked = approvals.settings.publishReview;
    keyed(this.approvalList, approvals.approvals, item => item.id, item => this.approvalCard(item), (node, item) => {
      text(node.querySelector('.fw-ac-name')!, item.kind === 'release.promote' ? t('Promote release {0} {1}', [item.subject.slug, item.subject.version]) : t('Agent wants to run {0}', [item.subject.tool]));
      text(node.querySelector('.fw-ac-sub')!, `${t('{0} via {1}', [item.requestedBy.name, item.requestedBy.channel])} · ${item.createdAt.slice(11, 19)}`);
    });
    this.approvalEmpty.hidden = approvals.approvals.length > 0;
    text(this.who, t('{0}, {1}: {2}.', [clients.access.identity.name, clients.access.role || { t: 'no role' }, clients.access.permissions.join(', ') || { t: 'no permissions' }]));
    keyed(this.feed, activity.activity, item => item.id, () => {
      const row = element('div', 'fw-ac-event');
      row.append(element('span', 'fw-ac-chan'), element('span', 'fw-ac-op'), element('span', 'fw-ac-time'));
      return row;
    }, (node, item) => {
      const chan = node.querySelector('.fw-ac-chan') as HTMLElement;
      chan.dataset.channel = item.channel;
      text(chan, item.channel);
      const command = typeof item.details.command === 'string' ? ' ' + item.details.command : '';
      text(node.querySelector('.fw-ac-op')!, `${item.operation.replace(/^engine\.exec$/, 'edit')}${command} · ${item.identity}`);
      text(node.querySelector('.fw-ac-time')!, item.createdAt.slice(11, 19));
    });
    this.feedEmpty.hidden = activity.activity.length > 0;
  }

  private clientCard(item: Client): HTMLElement {
    const card = element('div', 'fw-ac-card');
    card.dataset.client = item.id;
    const head = element('div', 'fw-ac-row');
    head.append(element('span', 'fw-ac-name', item.name), element('span', 'fw-ac-grow'), element('span', 'fw-ac-chip'));
    const actions = element('div', 'fw-ac-actions');
    const write = element('button', 'quiet', 'Write config');
    write.type = 'button';
    write.dataset.action = 'write';
    write.dataset.command = `agents.client.${item.id}`;
    write.addEventListener('click', () => void this.guard(async () => { await request(`/api/agents/clients/${item.id}`, {}); this.hooks.notify(t('{0} project config written.', [item.name])); }));
    const launch = element('button', 'quiet', 'Open in terminal');
    launch.type = 'button';
    launch.dataset.action = 'launch';
    launch.dataset.command = `agents.launch.${item.id}`;
    launch.addEventListener('click', () => this.hooks.launch(CLIENT_PRESET[item.id]));
    actions.append(write, launch);
    card.append(head, element('p', 'fw-ac-sub'), actions);
    return card;
  }

  private approvalCard(item: Approval): HTMLElement {
    const card = element('div', 'fw-ac-card is-pending');
    const decide = (decision: 'approve' | 'deny') => void this.guard(async () => {
      await request(`/api/approvals/${item.id}`, { decision });
      this.hooks.notify(decision === 'approve' ? 'Approved.' : 'Denied.');
    });
    const approve = element('button', 'primary', 'Approve');
    approve.type = 'button';
    approve.dataset.command = 'approvals.approve';
    approve.addEventListener('click', () => decide('approve'));
    const deny = element('button', 'quiet', 'Deny');
    deny.type = 'button';
    deny.dataset.command = 'approvals.deny';
    deny.addEventListener('click', () => decide('deny'));
    const actions = element('div', 'fw-ac-actions');
    actions.append(approve, deny);
    card.append(element('span', 'fw-ac-name'), element('p', 'fw-ac-sub'), actions);
    return card;
  }

  private async saveSettings(patch: Partial<Settings>): Promise<void> {
    await request('/api/approvals/settings', patch);
    this.hooks.notify('Approval settings saved.');
  }
}
