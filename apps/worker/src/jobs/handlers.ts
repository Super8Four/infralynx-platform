import { resolve } from "node:path";

import type { JobRecord } from "../../../../packages/job-core/dist/index.js";
import { executeImportJobPayload } from "../../../../packages/data-transfer/dist/index.js";
import { createFileBackedEventRepository } from "../../../../packages/event-core/dist/index.js";
import {
  createFileBackedWebhookRepository,
  createWebhookDeliveryRecord,
  deliverWebhook
} from "../../../../packages/webhooks/dist/index.js";

export type JobHandler = (job: JobRecord) => Promise<Record<string, unknown>>;

const eventRepository = createFileBackedEventRepository(resolve(process.cwd(), "runtime-data/events/events.json"));
const webhookRepository = createFileBackedWebhookRepository(resolve(process.cwd(), "runtime-data/webhooks/state.json"));

export const jobHandlers: Readonly<Record<string, JobHandler>> = {
  "core.echo": async (job) => ({
    echoedPayload: job.payload,
    processedAt: new Date().toISOString()
  }),
  "core.retry-demo": async (job) => {
    const failUntilAttempt =
      typeof job.payload["failUntilAttempt"] === "number"
        ? Number(job.payload["failUntilAttempt"])
        : 0;
    const currentAttempt = job.retryCount + 1;

    if (currentAttempt <= failUntilAttempt) {
      throw new Error(`simulated retry path on attempt ${currentAttempt}`);
    }

    return {
      recoveredAtAttempt: currentAttempt
    };
  },
  "data-transfer.import": async (job) => executeImportJobPayload(job.payload),
  "webhook.deliver": async (job) => {
    const eventId = typeof job.payload["eventId"] === "string" ? job.payload["eventId"] : null;
    const webhookId = typeof job.payload["webhookId"] === "string" ? job.payload["webhookId"] : null;

    if (!eventId || !webhookId) {
      throw new Error("webhook delivery jobs require eventId and webhookId payload fields");
    }

    const event = eventRepository.getEvent(eventId);
    const webhook = webhookRepository.getWebhookById(webhookId);

    if (!event) {
      throw new Error(`webhook delivery event ${eventId} was not found`);
    }

    if (!webhook) {
      throw new Error(`webhook delivery target ${webhookId} was not found`);
    }

    try {
      const delivery = await deliverWebhook({
        webhook,
        event
      });

      webhookRepository.saveDelivery(delivery);

      return {
        deliveryId: delivery.id,
        eventId,
        webhookId,
        responseStatus: delivery.responseStatus
      };
    } catch (error) {
      webhookRepository.saveDelivery(
        createWebhookDeliveryRecord({
          webhookId,
          eventId,
          status: "failed",
          responseStatus: null,
          errorMessage: error instanceof Error ? error.message : "unknown webhook delivery error"
        })
      );

      throw error;
    }
  }
};
