import { Module } from '@nestjs/common';

import { SpeakzoneController } from './controller';
import { SpeakzoneService } from './service';

/**
 * SpeakZone: account closure hand-over called by the platform gateway
 * (web_registration_gateway core/lifecycle.close_account). Enabled only when
 * SPEAKZONE_HANDOVER_TOKEN is set.
 */
@Module({
  providers: [SpeakzoneService],
  controllers: [SpeakzoneController],
})
export class SpeakzoneModule {}
