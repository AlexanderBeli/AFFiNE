import ava, { TestFn } from 'ava';

import {
  createTestingModule,
  type TestingModule,
} from '../../../__tests__/utils';
import { Models, WorkspaceRole } from '../../../models';
import { SpeakzoneService } from '../service';

interface Context {
  module: TestingModule;
  models: Models;
  service: SpeakzoneService;
}

const test = ava as TestFn<Context>;

test.before(async t => {
  const module = await createTestingModule({ providers: [SpeakzoneService] });
  t.context.module = module;
  t.context.models = module.get(Models);
  t.context.service = module.get(SpeakzoneService);
});

test.beforeEach(async t => {
  await t.context.module.initTestingDB();
});

test.after.always(async t => {
  await t.context.module.close();
});

async function setup(t: { context: Context }) {
  const { models } = t.context;
  const admin = await models.user.create({ email: 'admin@speakzone.online' });
  await models.userFeature.add(admin.id, 'administrator', 'test');
  const teacher = await models.user.create({ email: 'anna@example.com' });
  const ws = await models.workspace.create(teacher.id);
  await models.session.createOrRefreshUserSession(teacher.id);
  await models.user.createConnectedAccount({
    userId: teacher.id,
    provider: 'oidc',
    providerAccountId: '42',
    accessToken: 'x',
  });
  return { admin, teacher, ws };
}

test('hands owned workspaces to the instance admin and locks the user', async t => {
  const { models, service } = t.context;
  const { admin, teacher, ws } = await setup(t);

  const res = await service.closeAccount(
    'anna@example.com',
    'anna-deleted-42@example.com'
  );

  t.deepEqual(res, { found: true, workspaces: [ws.id] });
  t.is((await models.workspaceUser.getOwner(ws.id)).id, admin.id);
  // the teacher stays a member — authorship of the boards is kept
  t.truthy(await models.workspaceUser.getActive(ws.id, teacher.id));

  const after = await models.user.get(teacher.id, { withDisabled: true });
  t.is(after?.email, 'anna-deleted-42@example.com');
  t.true(after?.disabled);
  t.is(await models.user.getUserByEmail('anna@example.com'), null);
  t.is(await models.user.getConnectedAccount('oidc', '42'), null);
  t.is(await models.session.deleteUserSessions(teacher.id), 0);
});

test('retry by the renamed email is a no-op', async t => {
  const { service } = t.context;
  await setup(t);
  await service.closeAccount('anna@example.com', 'anna-deleted-42@example.com');

  const again = await service.closeAccount(
    'anna@example.com',
    'anna-deleted-42@example.com'
  );
  t.deepEqual(again, { found: true, workspaces: [] });
});

test('unknown email is reported, not an error', async t => {
  const { service } = t.context;
  await setup(t);
  t.deepEqual(
    await service.closeAccount('nobody@x.y', 'nobody-deleted-1@x.y'),
    {
      found: false,
      workspaces: [],
    }
  );
});

test('admin already a member keeps membership and becomes owner', async t => {
  const { models, service } = t.context;
  const { admin, ws } = await setup(t);
  await models.workspaceUser.set(ws.id, admin.id, WorkspaceRole.Collaborator, {
    status: 'Accepted' as any,
  });

  await service.closeAccount('anna@example.com', 'anna-deleted-42@example.com');
  t.is((await models.workspaceUser.getOwner(ws.id)).id, admin.id);
});
