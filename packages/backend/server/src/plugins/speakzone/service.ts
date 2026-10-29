import { Injectable, Logger } from '@nestjs/common';
import {
  PrismaClient,
  WorkspaceMemberSource,
  WorkspaceMemberStatus,
} from '@prisma/client';

import { Models, WorkspaceRole } from '../../models';

export interface HandoverResult {
  found: boolean;
  workspaces: string[];
}

@Injectable()
export class SpeakzoneService {
  private readonly logger = new Logger(SpeakzoneService.name);

  constructor(
    private readonly models: Models,
    private readonly db: PrismaClient
  ) {}

  /** SPEAKZONE_MATERIALS_OWNER_EMAIL, otherwise the oldest instance admin. */
  async materialsOwner() {
    const email = process.env.SPEAKZONE_MATERIALS_OWNER_EMAIL;
    if (email) return await this.models.user.getUserByEmail(email);
    const [admin] = await this.models.user.list({
      features: ['administrator'],
      take: 1,
    });
    return admin ?? null;
  }

  /**
   * The platform closed this account: workspaces it owns go to the materials
   * owner (the teacher stays a member, so authorship is kept), the user is
   * disabled, signed out and unlinked from OIDC, and the email is renamed —
   * the platform frees the original address, and OIDC sign-up matches users
   * by email, so a new account with it must not land in the old one.
   * Idempotent: a retry finds the user by the renamed email.
   */
  async closeAccount(email: string, newEmail: string): Promise<HandoverResult> {
    const user =
      (await this.models.user.getUserByEmail(email, { withDisabled: true })) ??
      (await this.models.user.getUserByEmail(newEmail, { withDisabled: true }));
    if (!user) return { found: false, workspaces: [] };

    const owner = await this.materialsOwner();
    if (!owner) throw new Error('No materials owner (instance admin) found');

    const owned = await this.models.workspaceUser.getUserActiveRoles(user.id, {
      role: WorkspaceRole.Owner,
    });
    const workspaces: string[] = [];
    for (const { workspaceId } of owned) {
      if (owner.id === user.id) break;
      const active = await this.models.workspaceUser.getActive(
        workspaceId,
        owner.id
      );
      if (!active) {
        await this.models.workspaceUser.set(
          workspaceId,
          owner.id,
          WorkspaceRole.Collaborator,
          {
            status: WorkspaceMemberStatus.Accepted,
            source: WorkspaceMemberSource.Email,
          }
        );
      }
      await this.models.workspaceUser.setOwner(workspaceId, owner.id);
      workspaces.push(workspaceId);
    }

    await this.models.session.deleteUserSessions(user.id);
    await this.db.connectedAccount.deleteMany({ where: { userId: user.id } });
    await this.models.user.update(user.id, {
      ...(user.email === newEmail ? {} : { email: newEmail }),
      disabled: true,
    });
    this.logger.log(
      `Closed account ${user.id}: ${workspaces.length} workspace(s) handed over to ${owner.id}`
    );
    return { found: true, workspaces };
  }
}
