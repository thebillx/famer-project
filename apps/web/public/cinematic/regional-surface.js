// One authored layout at the Thailand tangent. Both surfaces sample identical
// angular coordinates while the accepted affine world expansion remains intact.
// This is illustrative agricultural artwork, not higher-resolution satellite data.
export const regionalSurfaceGLSL=`
uniform sampler2D regionalMap;
uniform float regionalBlend;
vec3 regionalSurfaceColor(vec3 basemap,vec3 tangentDirection){
 vec3 direction=normalize(tangentDirection);
 vec2 local=direction.xz*900.;
 float edge=1.-smoothstep(44.,64.,max(abs(local.x),abs(local.y)));
 float amount=regionalBlend*edge*smoothstep(.95,.99,direction.y);
 vec3 regional=texture2D(regionalMap,local/128.+.5).rgb;
 return mix(basemap,regional,amount);
}`;
