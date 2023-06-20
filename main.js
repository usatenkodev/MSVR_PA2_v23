'use strict';

let gl;
let surface;
let shProgram;
let spaceball;
let userPointCoord;
let userRotAngle;
let sphere;
let video, track, texture, webCamTexture, stereoCam, webCamSurface;

function getWebcam() {
  navigator.getUserMedia({ video: true, audio: false }, function(stream) {
    video.srcObject = stream;
    track = stream.getTracks()[0];
  }, function(e) {
    console.error('Rejected!', e);
  });
}

function CreateWebCamTexture() {
  webCamTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, webCamTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

function deg2rad(angle) {
  return angle * Math.PI / 180;
}

function StereoCamera(
  Convergence,
  EyeSeparation,
  AspectRatio,
  FOV,
  NearClippingDistance,
  FarClippingDistance
) {
  this.mConvergence = Convergence;
  this.mEyeSeparation = EyeSeparation;
  this.mAspectRatio = AspectRatio;
  this.mFOV = FOV;
  this.mNearClippingDistance = NearClippingDistance;
  this.mFarClippingDistance = FarClippingDistance;

  this.mProjectionMatrix = null;
  this.mModelViewMatrix = null;

  this.ApplyLeftFrustum = function() {
    let top, bottom, left, right;
    top = this.mNearClippingDistance * Math.tan(this.mFOV / 2);
    bottom = -top;

    let a = this.mAspectRatio * Math.tan(this.mFOV / 2) * this.mConvergence;
    let b = a - this.mEyeSeparation / 2;
    let c = a + this.mEyeSeparation / 2;

    left = (-b * this.mNearClippingDistance) / this.mConvergence;
    right = (c * this.mNearClippingDistance) / this.mConvergence;

    // Set the Projection Matrix
    this.mProjectionMatrix = m4.frustum(
      left,
      right,
      bottom,
      top,
      this.mNearClippingDistance,
      this.mFarClippingDistance
    );

    // Displace the world to right
    this.mModelViewMatrix = m4.translation(
      this.mEyeSeparation / 2,
      0.0,
      0.0
    );
  };

  this.ApplyRightFrustum = function() {
    let top, bottom, left, right;
    top = this.mNearClippingDistance * Math.tan(this.mFOV / 2);
    bottom = -top;

    let a = this.mAspectRatio * Math.tan(this.mFOV / 2) * this.mConvergence;
    let b = a - this.mEyeSeparation / 2;
    let c = a + this.mEyeSeparation / 2;

    left = (-c * this.mNearClippingDistance) / this.mConvergence;
    right = (b * this.mNearClippingDistance) / this.mConvergence;

    // Set the Projection Matrix
    this.mProjectionMatrix = m4.frustum(
      left,
      right,
      bottom,
      top,
      this.mNearClippingDistance,
      this.mFarClippingDistance
    );

    // Displace the world to left
    this.mModelViewMatrix = m4.translation(
      -this.mEyeSeparation / 2,
      0.0,
      0.0
    );
  };

  this.change = function() {
    let params = document.getElementsByClassName("params");
    let eyeSep = 70.0;
    eyeSep = document.getElementById("e").value;
    params[0].innerHTML = eyeSep;
    this.mEyeSeparation = eyeSep;
    let fov = 0.8;
    fov = document.getElementById("f").value;
    params[1].innerHTML = fov;
    this.mFOV = fov;
    let nearClip = 5.0;
    nearClip = document.getElementById("n").value - 0.0;
    params[2].innerHTML = nearClip;
    this.mNearClippingDistance = nearClip
    let convergence = 2000.0;
    convergence = document.getElementById("c").value;
    params[3].innerHTML = convergence;
    this.mConvergence = convergence
  }
}


function Model(name) {
  this.name = name;
  this.iVertexBuffer = gl.createBuffer();
  this.iNormalBuffer = gl.createBuffer();
  this.iTextureBuffer = gl.createBuffer();
  this.count = 0;
  this.countT = 0;

  this.BufferData = function(vertices) {

    gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW);

    this.count = vertices.length / 3;
  }

  this.TextureBufferData = function(points) {

    gl.bindBuffer(gl.ARRAY_BUFFER, this.iTextureBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.STREAM_DRAW);

    this.countT = points.length / 2;
  }

  this.Draw = function() {

    gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
    gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shProgram.iAttribVertex);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.iNormalBuffer);
    gl.vertexAttribPointer(shProgram.iAttribNormal, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shProgram.iAttribNormal);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.iTextureBuffer);
    gl.vertexAttribPointer(shProgram.iAttribTexture, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shProgram.iAttribTexture);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.count);
  }

  this.DrawSphere = function() {
    gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
    gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shProgram.iAttribVertex);
    gl.drawArrays(gl.LINE_STRIP, 0, this.count);
  }
}


// Constructor
function ShaderProgram(name, program) {

  this.name = name;
  this.prog = program;

  // Location of the attribute variable in the shader program.
  this.iAttribVertex = -1;
  this.iAttribNormal = -1;
  this.iAttribTexture = -1;
  // Location of the uniform specifying a color for the primitive.
  this.iColor = -1;
  // Location of the uniform matrix representing the combined transformation.
  this.iModelViewProjectionMatrix = -1;
  this.iNormalMatrix = -1;
  this.lightPosLoc = -1;

  this.iUserPoint = -1;
  this.irotAngle = 0;
  this.iUP = -1;

  this.iTMU = -1;

  this.Use = function() {
    gl.useProgram(this.prog);
  }
}


/* Draws a colored cube, along with a set of coordinate axes.
 * (Note that the use of the above drawPrimitive function is not an efficient
 * way to draw with WebGL.  Here, the geometry is so simple that it doesn't matter.)
 */
function draw() {
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  /* Set the values of the projection transformation */
  // let projection = m4.perspective(Math.PI / 8, 1, 8, 12);
  stereoCam.change();
  let para = 3
  let projection = m4.orthographic(-para, para, -para, para, 0, para * 4);

  /* Get the view matrix from the SimpleRotator object.*/
  let modelView = spaceball.getViewMatrix();
  let webCamView = m4.identity();

  let rotateToPointZero = m4.axisRotation([0.707, 0.707, 0], 0.0);
  let translateToPointZero = m4.translation(0, 0, -10);
  let translateToFit = m4.translation(-0.5, -0.5, -10);
  let scaleToFit = m4.scaling(4, 4, 1)


  let matAccum0 = m4.multiply(rotateToPointZero, modelView);
  let webCammatAccum0 = m4.multiply(rotateToPointZero, webCamView);
  let matAccum1 = m4.multiply(translateToPointZero, matAccum0);
  let webCammatAccum1 = m4.multiply(translateToFit, webCammatAccum0);
  let webCammatAccum2 = m4.multiply(scaleToFit, webCammatAccum1);
  let matAccum2 = m4.multiply(matAccum1, rotMat4);

  gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, webCammatAccum2);
  gl.uniformMatrix4fv(shProgram.iProjectionMatrix, false, projection);

  gl.uniform1i(shProgram.iTMU, 0);
  gl.enable(gl.TEXTURE_2D);
  // gl.bindTexture(gl.TEXTURE_2D, webCamTexture);
  // gl.texImage2D(
  //     gl.TEXTURE_2D,
  //     0,
  //     gl.RGBA,
  //     gl.RGBA,
  //     gl.UNSIGNED_BYTE,
  //     video
  // );
  // webCamSurface.Draw();
  gl.uniform2fv(shProgram.iUserPoint, [0.0, 0.0]);
  gl.uniform1f(shProgram.irotAngle, userRotAngle);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  stereoCam.ApplyLeftFrustum();
  gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, matAccum2);
  gl.uniformMatrix4fv(shProgram.iProjectionMatrix, false, stereoCam.mProjectionMatrix);
  gl.colorMask(false, true, true, false);
  surface.Draw();
  gl.clear(gl.DEPTH_BUFFER_BIT);
  stereoCam.ApplyRightFrustum();
  gl.uniformMatrix4fv(shProgram.iProjectionMatrix, false, stereoCam.mProjectionMatrix);
  gl.colorMask(true, false, false, false);
  surface.Draw();
  gl.colorMask(true, true, true, true);
  // let trS = wellenkugel(map(userPointCoord.x, 0, 1, 0, 14.4), map(userPointCoord.y, 0, 1, 0, Math.PI * 1.5));
  // gl.uniform2fv(shProgram.iUserPoint, [userPointCoord.x, userPointCoord.y]); //giving coordinates of user point
  // gl.uniform3fv(shProgram.iUP, [trS.x, trS.y, trS.z]);
  // sphere.DrawSphere();
}

function changing() {
  draw();
  window.requestAnimationFrame(changing);
}


function map(val, f1, t1, f2, t2) {
  let m;
  m = (val - f1) * (t2 - f2) / (t1 - f1) + f2
  return Math.min(Math.max(m, f2), t2);
}

function CreateSurfaceTextureData() {
  let vertexList = [];
  let i = 0,
    j = 0;
  const step = 0.1;
  const uts = map(step, 0, 14.5, 0, 1)
  const vts = map(step, 0, Math.PI * 1.5, 0, 1)
  while (j < Math.PI * 1.5) {
    while (i < 14.5) {
      let u = map(i, 0, 14.5, 0, 1)
      let v = map(j, 0, Math.PI * 1.5, 0, 1)
      vertexList.push(u, v)
      vertexList.push(u + uts, v)
      vertexList.push(u, v + vts)
      vertexList.push(u, v + vts)
      vertexList.push(u + uts, v + vts)
      vertexList.push(u + uts, v)
      i += step
    }
    i = 0;
    j += step
  }
  return vertexList;
}

function CreateSurfaceData() {
  let vertexList = [];
  let i = 0,
    j = 0;
  const step = 0.1;
  while (j < Math.PI * 1.5) {
    while (i < 14.5) {
      let v1 = wellenkugel(i, j)
      let v2 = wellenkugel(i + step, j)
      let v3 = wellenkugel(i, j + step)
      let v4 = wellenkugel(i + step, j + step)
      vertexList.push(v1.x, v1.y, v1.z);
      vertexList.push(v2.x, v2.y, v2.z);
      vertexList.push(v3.x, v3.y, v3.z);
      vertexList.push(v3.x, v3.y, v3.z);
      vertexList.push(v4.x, v4.y, v4.z);
      vertexList.push(v2.x, v2.y, v2.z);
      i += step
    }
    i = 0;
    j += step
  }
  return vertexList;
}

function wellenkugel(u, v) {
  const c = 0.1
  let x = c * u * Math.cos(Math.cos(u)) * Math.cos(v),
    y = c * u * Math.cos(Math.cos(u)) * Math.sin(v),
    z = c * u * Math.sin(Math.cos(u));
  return {
    x: x,
    y: y,
    z: z
  }

}
function CreateSphereSurface(r = 0.05) {
  let vertexList = [];
  let lon = -Math.PI;
  let lat = -Math.PI * 0.5;
  while (lon < Math.PI) {
    while (lat < Math.PI * 0.5) {
      let v1 = sphereSurfaceData(r, lon, lat);
      vertexList.push(v1.x, v1.y, v1.z);
      lat += 0.05;
    }
    lat = -Math.PI * 0.5
    lon += 0.05;
  }
  return vertexList;
}

function sphereSurfaceData(r, u, v) {
  let x = r * Math.sin(u) * Math.cos(v);
  let y = r * Math.sin(u) * Math.sin(v);
  let z = r * Math.cos(u);
  return { x: x, y: y, z: z };
}

/* Initialize the WebGL context. Called from init() */
function initGL() {
  let prog = createProgram(gl, vertexShaderSource, fragmentShaderSource);

  shProgram = new ShaderProgram('Basic', prog);
  shProgram.Use();

  shProgram.iAttribVertex = gl.getAttribLocation(prog, "vertex");
  shProgram.iAttribTexture = gl.getAttribLocation(prog, "texCoord");
  shProgram.iModelViewMatrix = gl.getUniformLocation(prog, "ModelViewMatrix");
  shProgram.iProjectionMatrix = gl.getUniformLocation(prog, "ProjectionMatrix");
  shProgram.iTMU = gl.getUniformLocation(prog, 'tmu');
  shProgram.iUserPoint = gl.getUniformLocation(prog, 'userPoint');
  shProgram.irotAngle = gl.getUniformLocation(prog, 'rotA');
  shProgram.iUP = gl.getUniformLocation(prog, 'translateUP');

  surface = new Model('Surface');
  sphere = new Model('Sphere');
  surface.BufferData(CreateSurfaceData());
  LoadTexture();
  surface.TextureBufferData(CreateSurfaceTextureData());
  sphere.BufferData(CreateSphereSurface())
  webCamSurface = new Model('Web Cam Surface')
  webCamSurface.BufferData([0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0]);
  webCamSurface.TextureBufferData([1, 1, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1]);

  gl.enable(gl.DEPTH_TEST);
}


/* Creates a program for use in the WebGL context gl, and returns the
 * identifier for that program.  If an error occurs while compiling or
 * linking the program, an exception of type Error is thrown.  The error
 * string contains the compilation or linking error.  If no error occurs,
 * the program identifier is the return value of the function.
 * The second and third parameters are strings that contain the
 * source code for the vertex shader and for the fragment shader.
 */
function createProgram(gl, vShader, fShader) {
  let vsh = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vsh, vShader);
  gl.compileShader(vsh);
  if (!gl.getShaderParameter(vsh, gl.COMPILE_STATUS)) {
    throw new Error("Error in vertex shader:  " + gl.getShaderInfoLog(vsh));
  }
  let fsh = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fsh, fShader);
  gl.compileShader(fsh);
  if (!gl.getShaderParameter(fsh, gl.COMPILE_STATUS)) {
    throw new Error("Error in fragment shader:  " + gl.getShaderInfoLog(fsh));
  }
  let prog = gl.createProgram();
  gl.attachShader(prog, vsh);
  gl.attachShader(prog, fsh);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error("Link error in program:  " + gl.getProgramInfoLog(prog));
  }
  return prog;
}


/**
 * initialization function that will be called when the page has loaded
 */
function init() {
  userPointCoord = { x: 0.1, y: 0.1 }
  userRotAngle = 0.0;
  let canvas;
  try {
    stereoCam = new StereoCamera(
      2000,
      70.0,
      1,
      0.8,
      5,
      100
    );
    let resolution = Math.min(window.innerHeight, window.innerWidth);
    canvas = document.querySelector('canvas');
    gl = canvas.getContext("webgl");
    canvas.width = resolution;
    canvas.height = resolution;
    gl.viewport(0, 0, resolution, resolution);
    // video = document.createElement('video');
    // video.setAttribute('autoplay', true);
    // window.vid = video;
    // getWebcam();
    // CreateWebCamTexture();
    if (!gl) {
      throw "Browser does not support WebGL";
    }
  }
  catch (e) {
    document.querySelector('"canvas-holder"').innerHTML =
      "<p>Sorry, could not get a WebGL graphics context.</p>";
    return;
  }
  try {
    initGL();
  }
  catch (e) {
    document.getElementById("canvas-holder").innerHTML =
      "<p>Sorry, could not initialize the WebGL graphics context: " + e + "</p>";
    return;
  }

  spaceball = new TrackballRotator(canvas, draw, 0);

  // draw();
  changing();
}

function mat4Transpose(a, transposed) {
  var t = 0;
  for (var i = 0; i < 4; ++i) {
    for (var j = 0; j < 4; ++j) {
      transposed[t++] = a[j * 4 + i];
    }
  }
}

function mat4Invert(m, inverse) {
  var inv = new Float32Array(16);
  inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] +
    m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
  inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] -
    m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
  inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] +
    m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
  inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] -
    m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
  inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] -
    m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
  inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] +
    m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
  inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] -
    m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
  inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] +
    m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
  inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] +
    m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
  inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] -
    m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
  inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] +
    m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
  inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] -
    m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
  inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] -
    m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
  inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] +
    m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
  inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] -
    m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
  inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] +
    m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];

  var det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
  if (det == 0) return false;
  det = 1.0 / det;
  for (var i = 0; i < 16; i++) inverse[i] = inv[i] * det;
  return true;
}

window.onkeydown = (e) => {
  switch (e.keyCode) {
    case 87:
      userPointCoord.x -= 0.01;
      break;
    case 83:
      userPointCoord.x += 0.01;
      break;
    case 65:
      userPointCoord.y += 0.01;
      break;
    case 68:
      userPointCoord.y -= 0.01;
      break;
  }
  userPointCoord.x = Math.max(0.001, Math.min(userPointCoord.x, 0.999))
  userPointCoord.y = Math.max(0.001, Math.min(userPointCoord.y, 0.999))
  draw();
}

function LoadTexture() {
  texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const image = new Image();
  image.crossOrigin = 'anonymus';
  image.src = "https://raw.githubusercontent.com/usatenkodev/CGWv24/main/grass.jpg";
  image.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      image
    );
    draw()
  }
}
let rotVec3 = [0.0, 0.0, 0.0];
let rotMat4 = Array(16).fill(0.0);
function getRotationMatrixFromVector(rotationVector) {
  const q1 = rotationVector[0];
  const q2 = rotationVector[1];
  const q3 = rotationVector[2];
  let q0;

  if (rotationVector.length >= 4) {
    q0 = rotationVector[3];
  } else {
    q0 = 1 - q1 * q1 - q2 * q2 - q3 * q3;
    q0 = q0 > 0 ? Math.sqrt(q0) : 0;
  }
  const sq_q1 = 2 * q1 * q1;
  const sq_q2 = 2 * q2 * q2;
  const sq_q3 = 2 * q3 * q3;
  const q1_q2 = 2 * q1 * q2;
  const q3_q0 = 2 * q3 * q0;
  const q1_q3 = 2 * q1 * q3;
  const q2_q0 = 2 * q2 * q0;
  const q2_q3 = 2 * q2 * q3;
  const q1_q0 = 2 * q1 * q0;
  let R = [];
  R.push(1 - sq_q2 - sq_q3);
  R.push(q1_q2 - q3_q0);
  R.push(q1_q3 + q2_q0);
  R.push(0.0);
  R.push(q1_q2 + q3_q0);
  R.push(1 - sq_q1 - sq_q3);
  R.push(q2_q3 - q1_q0);
  R.push(0.0);
  R.push(q1_q3 - q2_q0);
  R.push(q2_q3 + q1_q0);
  R.push(1 - sq_q1 - sq_q2);
  R.push(0.0);
  R.push(0.0);
  R.push(0.0);
  R.push(0.0);
  R.push(1.0);
  return R;
}
let timeStamp = 0.0;
const NS2S = 1.0 / 10000.0;
function requestDeviceMotion() {
  timeStamp = Date.now();
  if (typeof DeviceMotionEvent !== 'undefined' &&
    typeof DeviceMotionEvent.requestPermission === 'function') {
    DeviceMotionEvent.requestPermission()
      .then(response => {
        console.log(response);
        if (response === 'granted') {
          console.log('Permission granted');
          window.addEventListener('devicemotion', e => {
            let dT = (Date.now() - timeStamp) * NS2S
            rotVec3[0] += e.rotationRate.alpha * NS2S;
            rotVec3[1] += e.rotationRate.beta * NS2S;
            rotVec3[2] += e.rotationRate.gamma * NS2S;
            rotMat4 = getRotationMatrixFromVector(rotVec3);
            timeStamp = Date.now();
          }, true);
        }
      }).catch((err => {
        console.log('Err', err);
      }));
  } else
    console.log('not iOS');
}