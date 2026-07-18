import { EdgelessLegacySlotIdentifier } from '@blocksuite/affine-block-surface';
import { Bound } from '@blocksuite/global/gfx';
import { GfxExtension } from '@blocksuite/std/gfx';
import { effect } from '@preact/signals-core';

import { EdgelessFrameManagerIdentifier } from '../frame-manager';
import { PresentTool } from '../present-tool';

/**
 * Fork (platform): live presentation follow.
 *
 * The peer that runs presentation mode (the teacher) broadcasts the currently
 * presented frame through the doc awareness. Every other collaborator on the
 * same board (students) automatically follows: their viewport is moved to the
 * presented frame each time the presenter navigates.
 *
 * Followers keep full local control between the presenter's frame changes —
 * nothing is locked; we only re-sync the viewport on navigation events.
 */
export class FollowPresentationExtension extends GfxExtension {
  static override key = 'follow-presentation';

  private readonly _disposables: (() => void)[] = [];

  private get awareness() {
    return this.std.store.awarenessStore.awareness;
  }

  private _isPresenting(): boolean {
    return (
      this.gfx.tool.currentToolOption$.peek()?.toolType === PresentTool
    );
  }

  private _broadcast(frameId: string | null) {
    this.awareness.setLocalStateField(
      'presentation',
      frameId ? { frameId, ts: Date.now() } : null
    );
  }

  private _followRemotePresenter() {
    if (this._isPresenting()) return;

    const localId = this.awareness.clientID;
    let latest: { frameId: string; ts: number } | null = null;
    this.awareness.getStates().forEach((state, id) => {
      if (id === localId) return;
      const presentation = (state as { presentation?: typeof latest })
        ?.presentation;
      if (
        presentation?.frameId &&
        (!latest || presentation.ts > latest.ts)
      ) {
        latest = presentation;
      }
    });
    if (!latest) return;

    const { frameId } = latest as { frameId: string };
    const frames = this.std.get(EdgelessFrameManagerIdentifier).frames;
    const frame = frames.find(f => f.id === frameId);
    if (!frame) return;

    this.gfx.viewport.setViewportByBound(
      Bound.deserialize(frame.xywh),
      [0, 0, 0, 0],
      true
    );
  }

  override mounted() {
    const slots = this.std.get(EdgelessLegacySlotIdentifier);

    // presenter side: announce every presented frame
    const frameSub = slots.navigatorFrameChanged.subscribe(frame => {
      if (this._isPresenting()) {
        this._broadcast(frame.id);
      }
    });
    this._disposables.push(() => frameSub.unsubscribe());

    // presenter side: clear the announcement when leaving presentation mode
    const disposeToolWatch = effect(() => {
      const isPresenting =
        this.gfx.tool.currentToolOption$.value?.toolType === PresentTool;
      if (!isPresenting && this.awareness.getLocalState()?.presentation) {
        this._broadcast(null);
      }
    });
    this._disposables.push(disposeToolWatch);

    // follower side: move the viewport to the presented frame
    const onAwarenessChange = () => this._followRemotePresenter();
    this.awareness.on('change', onAwarenessChange);
    this._disposables.push(() =>
      this.awareness.off('change', onAwarenessChange)
    );
  }

  override unmounted() {
    if (this.awareness.getLocalState()?.presentation) {
      this._broadcast(null);
    }
    this._disposables.forEach(dispose => dispose());
    this._disposables.length = 0;
  }
}
