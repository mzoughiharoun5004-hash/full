import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  In,
  type EntityTarget,
  type FindOptionsWhere,
  type ObjectLiteral,
  type Repository,
} from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { ReorderItemDto } from '../dto/reorder.dto';

type Orderable = ObjectLiteral & { id: number; ordre: number };

/**
 * Shared implementation of "reorder children within one parent", used by
 * `course-module`, `sequence` and `activite`.
 *
 * Validates that every requested id exists *inside the given parent scope*
 * (so a caller cannot reorder a sibling belonging to someone else's parent),
 * then writes the new `ordre` values in a single transaction.
 *
 * The caller keeps ownership of the response: run your own `findBy...()`
 * afterwards so each service still returns its usual relations and ordering.
 */
export async function applyReorder<Entity extends Orderable>(
  repository: Repository<Entity>,
  entity: EntityTarget<Entity>,
  parentScope: FindOptionsWhere<Entity>,
  items: ReorderItemDto[],
  notFoundMessage: string,
): Promise<void> {
  if (!items.length) return;

  const ids = items.map((item) => item.id);

  // Duplicate ids would make the final ordering depend on write order.
  if (new Set(ids).size !== ids.length) {
    throw new BadRequestException(
      'Chaque élément ne peut apparaître qu’une seule fois dans un réordonnancement',
    );
  }

  const found = await repository.count({
    where: { ...parentScope, id: In(ids) } as FindOptionsWhere<Entity>,
  });

  if (found !== ids.length) {
    throw new NotFoundException(notFoundMessage);
  }

  // Sequential, not Promise.all: a transaction runs on a single QueryRunner,
  // so concurrent writes would interleave on one connection.
  await repository.manager.transaction(async (manager) => {
    for (const item of items) {
      await manager.update(entity, item.id, {
        ordre: item.ordre,
      } as unknown as QueryDeepPartialEntity<Entity>);
    }
  });
}
