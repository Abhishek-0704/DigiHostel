import type { EligibilityRepository } from "../eligibilityRepository.js";
import type { ParentRelationshipType } from "../types.js";

/** Deterministic in-memory fake — same convention as
 * `domain/leave/__fixtures__/fake-repository.ts`. */
export class FakeEligibilityRepository implements EligibilityRepository {
  private links = new Map<string, string>();

  /** Registers `rollNumber` + `relationshipType` as eligible, resolving to
   * `phoneNumber`. */
  addLink(rollNumber: string, relationshipType: ParentRelationshipType, phoneNumber: string): this {
    this.links.set(`${rollNumber}:${relationshipType}`, phoneNumber);
    return this;
  }

  async findEligiblePhone(
    rollNumber: string,
    relationshipType: ParentRelationshipType,
  ): Promise<string | null> {
    return this.links.get(`${rollNumber}:${relationshipType}`) ?? null;
  }
}
