// Public choices also constrain shared URLs and renderer uniforms.
export const CONTOUR_INTERVALS=Object.freeze([10,20,50,100,200]);
export function contourInterval(value){return CONTOUR_INTERVALS.includes(Number(value))?Number(value):100;}
