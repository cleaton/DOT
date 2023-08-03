export type DotMethods = {
  [key: string]: (args: any) => Promise<any> | any;
};

export const dotBase = "http://dot";
export const dotPrefix = "/~d~/";
