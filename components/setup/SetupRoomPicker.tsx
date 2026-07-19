"use client";

import {
  SetupMultiCheckPicker,
  type SetupCheckOption,
} from "@/components/setup/SetupMultiCheckPicker";

export type SetupRoomOption = {
  room_id: string;
  room_name: string;
};

type Props = {
  rooms: SetupRoomOption[];
  value: string[];
  onChange: (roomIds: string[]) => void;
  disabled?: boolean;
};

export function SetupRoomPicker({ rooms, value, onChange, disabled }: Props) {
  const options: SetupCheckOption[] = rooms.map((r) => ({
    value: r.room_id,
    label: r.room_name,
  }));
  return (
    <SetupMultiCheckPicker
      options={options}
      value={value}
      onChange={onChange}
      emptyLabel="未割当"
      disabled={disabled}
    />
  );
}
