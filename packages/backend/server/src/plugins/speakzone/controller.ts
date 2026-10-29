import { timingSafeEqual } from 'node:crypto';

import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';

import { BadRequest, NotFound } from '../../base';
import { Public } from '../../core/auth';
import { SpeakzoneService } from './service';

function tokenMatches(header: string | undefined, token: string) {
  const got = Buffer.from(header ?? '');
  const want = Buffer.from(`Bearer ${token}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

@Public()
@Controller('/api/speakzone')
export class SpeakzoneController {
  constructor(private readonly service: SpeakzoneService) {}

  @Post('/close-account')
  @HttpCode(200)
  async closeAccount(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { email?: unknown; newEmail?: unknown }
  ) {
    const token = process.env.SPEAKZONE_HANDOVER_TOKEN;
    // no token configured or a wrong one — the endpoint does not exist
    if (!token || !tokenMatches(authorization, token)) {
      throw new NotFound();
    }
    const { email, newEmail } = body ?? {};
    if (
      typeof email !== 'string' ||
      typeof newEmail !== 'string' ||
      !email.includes('@') ||
      !newEmail.includes('@')
    ) {
      throw new BadRequest('email and newEmail are required');
    }
    return await this.service.closeAccount(email, newEmail);
  }
}
