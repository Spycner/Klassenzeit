/**
 * Room API Service
 *
 * Provides methods for managing rooms within a school. Rooms are physical
 * spaces where lessons can be scheduled (e.g., classrooms, labs, gyms).
 */

import { apiClient } from "../client";
import type {
  CreateRoomRequest,
  RoomResponse,
  RoomSummary,
  UpdateRoomRequest,
} from "../types";

const getBasePath = (schoolId: string) => `/api/schools/${schoolId}/rooms`;

export const roomsApi = {
  /**
   * Retrieves all rooms for a specific school.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @returns Promise resolving to an array of room summaries
   * @throws {ClientError} When the school is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const rooms = await roomsApi.list("school-uuid");
   * console.log(rooms.map(r => `${r.name} (capacity: ${r.capacity})`));
   * ```
   */
  list(schoolId: string): Promise<RoomSummary[]> {
    return apiClient.get<RoomSummary[]>(getBasePath(schoolId));
  },

  /**
   * Retrieves a single room by its unique identifier.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param id - The unique identifier (UUID) of the room
   * @returns Promise resolving to the full room details including version
   * @throws {ClientError} When the school or room is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const room = await roomsApi.get("school-uuid", "room-uuid");
   * console.log(room.name, room.capacity);
   * ```
   */
  get(schoolId: string, id: string): Promise<RoomResponse> {
    return apiClient.get<RoomResponse>(`${getBasePath(schoolId)}/${id}`);
  },

  /**
   * Creates a new room within a school.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param data - The room creation data containing name, capacity, and optional description
   * @returns Promise resolving to the created room with its assigned ID and version
   * @throws {ClientError} When the school is not found (404) or validation fails (400)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const newRoom = await roomsApi.create("school-uuid", {
   *   name: "Room 101",
   *   capacity: 30
   * });
   * ```
   */
  create(schoolId: string, data: CreateRoomRequest): Promise<RoomResponse> {
    return apiClient.post<RoomResponse>(getBasePath(schoolId), data);
  },

  /**
   * Updates an existing room.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param id - The unique identifier (UUID) of the room to update
   * @param data - The update data including version for optimistic locking
   * @returns Promise resolving to the updated room with new version number
   * @throws {ClientError} When the school or room is not found (404), validation fails (400), or version conflict (409)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * const updated = await roomsApi.update("school-uuid", "room-uuid", {
   *   name: "Room 102",
   *   capacity: 35,
   *   version: 1
   * });
   * ```
   */
  update(
    schoolId: string,
    id: string,
    data: UpdateRoomRequest,
  ): Promise<RoomResponse> {
    return apiClient.put<RoomResponse>(`${getBasePath(schoolId)}/${id}`, data);
  },

  /**
   * Deletes a room.
   *
   * @param schoolId - The unique identifier (UUID) of the parent school
   * @param id - The unique identifier (UUID) of the room to delete
   * @returns Promise resolving when the room is successfully deleted
   * @throws {ClientError} When the school or room is not found (404)
   * @throws {NetworkError} When the API is unreachable or request times out
   * @throws {ServerError} When the server returns a 5xx error
   * @example
   * ```ts
   * await roomsApi.delete("school-uuid", "room-uuid");
   * ```
   */
  delete(schoolId: string, id: string): Promise<void> {
    return apiClient.delete<void>(`${getBasePath(schoolId)}/${id}`);
  },
};
