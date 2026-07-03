export const FACTORY_THEME = {
  background: '#050608',
  floor: '#d8dcdf',
  floorDark: '#a9b0b5',
  wall: '#f4f6f7',
  wallInner: '#d7dcdf',
  wallGlass: '#edf5f7',
  steel: '#596067',
  equipment: '#dfe5e8',
  equipmentDark: '#3a4147',
  shelfBlue: '#63a9df',
  box: '#b9966f',
  pallet: '#8b6a45',
  basket: '#6d8796',
  orange: '#ff7a1a',
  orangeSoft: '#ffb36b',
  cyan: '#73e2e6',
  cyanSoft: '#b7f4f5',
  alarm: '#ff4f2f',
  labelText: '#f5f7f8',
  labelMuted: '#aeb8bf',
} as const;

export const ISO_CAMERA = {
  position: [12, 10, 12] as [number, number, number],
  zoom: 11,
  near: 0.1,
  far: 800,
};

export const GLB_TARGET_SPAN = 46;

export const SHELL_NAME_PATTERN =
  /wall|roof|floor|level|railing|rail|stair|beam|column|window|door|panel|glass|柱|牆|墙|地|樓|楼|板|窗|門|门|钢|鋼|型钢|型鋼|hn400|ub-universal/i;

export const FLOOR_NAME_PATTERN = /floor|ground|地|地板|flooring/i;

export const ROOF_NAME_PATTERN = /roof|ceiling|天花|屋頂|屋顶/i;
