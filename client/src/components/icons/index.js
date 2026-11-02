/**
 * IonIcons for React (512x512 grid) — Ben Sperry, MIT License
 * Source: https://www.shadcn.io/icons/ion
 */
import { createElement } from 'react';

const scaleStrokeWidth = (strokeWidth, fallback) => {
  if (strokeWidth === undefined || strokeWidth === null) return fallback;
  const num = Number(strokeWidth);
  if (!Number.isFinite(num)) return fallback;
  return num <= 12 ? Math.round(num * 16) : num;
};

const renderNodes = (nodes, customStrokeWidth) =>
  nodes.map(([tag, attrs], idx) => {
    if (customStrokeWidth !== undefined && attrs.strokeWidth !== undefined) {
      return createElement(tag, {
        key: idx,
        ...attrs,
        strokeWidth: scaleStrokeWidth(customStrokeWidth, attrs.strokeWidth),
      });
    }
    return createElement(tag, { key: idx, ...attrs });
  });

const createIonIcon = (iconName, outlineNodes, filledNodes = null, defaultSize = 24) => {
  const IonIcon = ({
    size = defaultSize,
    color,
    fill,
    stroke,
    strokeWidth,
    style,
    ...props
  }) => {
    const isFilled = Boolean(filledNodes && fill && fill !== 'none');
    const activeNodes = isFilled ? filledNodes : outlineNodes;

    const resolvedColor =
      isFilled && fill !== 'currentColor'
        ? fill
        : color || (stroke && stroke !== 'currentColor' ? stroke : undefined);

    const mergedStyle = resolvedColor ? { color: resolvedColor, ...style } : style;

    return createElement(
      'svg',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        width: size,
        height: size,
        viewBox: '0 0 512 512',
        fill: isFilled ? 'currentColor' : fill || 'none',
        stroke: isFilled ? 'none' : stroke || 'currentColor',
        style: mergedStyle,
        'aria-hidden': props['aria-label'] ? undefined : true,
        'data-ion-icon': iconName,
        ...props,
      },
      renderNodes(activeNodes, strokeWidth)
    );
  };
  IonIcon.displayName = `Ion(${iconName})`;
  return IonIcon;
};

const ION_NODES = {
  "arrow-down-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "48",
        "d": "m112 268l144 144l144-144M256 392V100"
      }
    ]
  ],
  "arrow-back-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "48",
        "d": "M244 400L100 256l144-144M120 256h292"
      }
    ]
  ],
  "swap-horizontal-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "m304 48l112 112l-112 112m94.87-112H96m112 304L96 352l112-112m-94 112h302"
      }
    ]
  ],
  "arrow-forward-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "48",
        "d": "m268 112l144 144l-144 144m124-144H100"
      }
    ]
  ],
  "arrow-up-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "48",
        "d": "m112 244l144-144l144 144M256 120v292"
      }
    ]
  ],
  "at-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M320 254.27c-4.5 51-40.12 80-80.55 80s-67.34-35.82-63.45-80s37.12-80 77.55-80s70.33 36 66.45 80"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M319.77 415.77c-28.56 12-47.28 14.5-79.28 14.5c-97.2 0-169-78.8-160.49-176s94.31-176 191.51-176C381 78.27 441.19 150 432.73 246c-6.31 71.67-52.11 92.32-76.09 88.07c-22.56-4-41.18-24.42-37.74-63.5l8.48-96.25"
      }
    ]
  ],
  "ban-outline": [
    [
      "circle",
      {
        "cx": "256",
        "cy": "256",
        "r": "208",
        "fill": "none",
        "stroke": "currentColor",
        "strokeMiterlimit": "10",
        "strokeWidth": "32"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "m108.92 108.92l294.16 294.16"
      }
    ]
  ],
  "stats-chart-outline": [
    [
      "rect",
      {
        "width": "48",
        "height": "160",
        "x": "64",
        "y": "320",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "8",
        "ry": "8"
      }
    ],
    [
      "rect",
      {
        "width": "48",
        "height": "256",
        "x": "288",
        "y": "224",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "8",
        "ry": "8"
      }
    ],
    [
      "rect",
      {
        "width": "48",
        "height": "368",
        "x": "400",
        "y": "112",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "8",
        "ry": "8"
      }
    ],
    [
      "rect",
      {
        "width": "48",
        "height": "448",
        "x": "176",
        "y": "32",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "8",
        "ry": "8"
      }
    ]
  ],
  "notifications-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M427.68 351.43C402 320 383.87 304 383.87 217.35C383.87 138 343.35 109.73 310 96c-4.43-1.82-8.6-6-9.95-10.55C294.2 65.54 277.8 48 256 48s-38.21 17.55-44 37.47c-1.35 4.6-5.52 8.71-9.95 10.53c-33.39 13.75-73.87 41.92-73.87 121.35C128.13 304 110 320 84.32 351.43C73.68 364.45 83 384 101.61 384h308.88c18.51 0 27.77-19.61 17.19-32.57M320 384v16a64 64 0 0 1-128 0v-16"
      }
    ]
  ],
  "notifications": [
    [
      "path",
      {
        "fill": "currentColor",
        "d": "M440.08 341.31c-1.66-2-3.29-4-4.89-5.93c-22-26.61-35.31-42.67-35.31-118c0-39-9.33-71-27.72-95c-13.56-17.73-31.89-31.18-56.05-41.12a3 3 0 0 1-.82-.67C306.6 51.49 282.82 32 256 32s-50.59 19.49-59.28 48.56a3.1 3.1 0 0 1-.81.65c-56.38 23.21-83.78 67.74-83.78 136.14c0 75.36-13.29 91.42-35.31 118c-1.6 1.93-3.23 3.89-4.89 5.93a35.16 35.16 0 0 0-4.65 37.62c6.17 13 19.32 21.07 34.33 21.07H410.5c14.94 0 28-8.06 34.19-21a35.17 35.17 0 0 0-4.61-37.66M256 480a80.06 80.06 0 0 0 70.44-42.13a4 4 0 0 0-3.54-5.87H189.12a4 4 0 0 0-3.55 5.87A80.06 80.06 0 0 0 256 480"
      }
    ]
  ],
  "notifications-off-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M128.51 204.59q-.37 6.15-.37 12.76C128.14 304 110 320 84.33 351.43C73.69 364.45 83 384 101.62 384H320m94.5-48.7c-18.48-23.45-30.62-47.05-30.62-118c0-79.3-40.52-107.57-73.88-121.3c-4.43-1.82-8.6-6-9.95-10.55C294.21 65.54 277.82 48 256 48s-38.2 17.55-44 37.47c-1.35 4.6-5.52 8.71-10 10.53a150 150 0 0 0-18 8.79M320 384v16a64 64 0 0 1-128 0v-16"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M448 448L64 64"
      }
    ]
  ],
  "book-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M256 160c16-63.16 76.43-95.41 208-96a15.94 15.94 0 0 1 16 16v288a16 16 0 0 1-16 16c-128 0-177.45 25.81-208 64c-30.37-38-80-64-208-64c-9.88 0-16-8.05-16-17.93V80a15.94 15.94 0 0 1 16-16c131.57.59 192 32.84 208 96m0 0v288"
      }
    ]
  ],
  "bookmark-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M352 48H160a48 48 0 0 0-48 48v368l144-128l144 128V96a48 48 0 0 0-48-48"
      }
    ]
  ],
  "bookmark": [
    [
      "path",
      {
        "fill": "currentColor",
        "d": "M400 480a16 16 0 0 1-10.63-4L256 357.41L122.63 476A16 16 0 0 1 96 464V96a64.07 64.07 0 0 1 64-64h192a64.07 64.07 0 0 1 64 64v368a16 16 0 0 1-16 16"
      }
    ]
  ],
  "briefcase-outline": [
    [
      "rect",
      {
        "width": "448",
        "height": "320",
        "x": "32",
        "y": "128",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "48",
        "ry": "48"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M144 128V96a32 32 0 0 1 32-32h160a32 32 0 0 1 32 32v32m112 112H32m288 0v24a8 8 0 0 1-8 8H200a8 8 0 0 1-8-8v-24"
      }
    ]
  ],
  "gift-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M256 104v56h56a56 56 0 1 0-56-56Zm0 0v56h-56a56 56 0 1 1 56-56Z"
      }
    ],
    [
      "rect",
      {
        "width": "384",
        "height": "112",
        "x": "64",
        "y": "160",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "32",
        "ry": "32"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M416 272v144a48 48 0 0 1-48 48H144a48 48 0 0 1-48-48V272m160-112v304"
      }
    ]
  ],
  "calendar-outline": [
    [
      "rect",
      {
        "width": "416",
        "height": "384",
        "x": "48",
        "y": "80",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "48"
      }
    ],
    [
      "circle",
      {
        "cx": "296",
        "cy": "232",
        "r": "24",
        "fill": "currentColor"
      }
    ],
    [
      "circle",
      {
        "cx": "376",
        "cy": "232",
        "r": "24",
        "fill": "currentColor"
      }
    ],
    [
      "circle",
      {
        "cx": "296",
        "cy": "312",
        "r": "24",
        "fill": "currentColor"
      }
    ],
    [
      "circle",
      {
        "cx": "376",
        "cy": "312",
        "r": "24",
        "fill": "currentColor"
      }
    ],
    [
      "circle",
      {
        "cx": "136",
        "cy": "312",
        "r": "24",
        "fill": "currentColor"
      }
    ],
    [
      "circle",
      {
        "cx": "216",
        "cy": "312",
        "r": "24",
        "fill": "currentColor"
      }
    ],
    [
      "circle",
      {
        "cx": "136",
        "cy": "392",
        "r": "24",
        "fill": "currentColor"
      }
    ],
    [
      "circle",
      {
        "cx": "216",
        "cy": "392",
        "r": "24",
        "fill": "currentColor"
      }
    ],
    [
      "circle",
      {
        "cx": "296",
        "cy": "392",
        "r": "24",
        "fill": "currentColor"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M128 48v32m256-32v32"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M464 160H48"
      }
    ]
  ],
  "camera-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "m350.54 148.68l-26.62-42.06C318.31 100.08 310.62 96 302 96h-92c-8.62 0-16.31 4.08-21.92 10.62l-26.62 42.06C155.85 155.23 148.62 160 140 160H80a32 32 0 0 0-32 32v192a32 32 0 0 0 32 32h352a32 32 0 0 0 32-32V192a32 32 0 0 0-32-32h-59c-8.65 0-16.85-4.77-22.46-11.32"
      }
    ],
    [
      "circle",
      {
        "cx": "256",
        "cy": "272",
        "r": "80",
        "fill": "none",
        "stroke": "currentColor",
        "strokeMiterlimit": "10",
        "strokeWidth": "32"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M124 158v-22h-24v22"
      }
    ]
  ],
  "checkmark-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M416 128L192 384l-96-96"
      }
    ]
  ],
  "checkmark-done-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M464 128L240 384l-96-96m0 96l-96-96m320-160L232 284"
      }
    ]
  ],
  "checkmark-circle-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M448 256c0-106-86-192-192-192S64 150 64 256s86 192 192 192s192-86 192-192Z"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M352 176L217.6 336L160 272"
      }
    ]
  ],
  "checkmark-circle": [
    [
      "path",
      {
        "fill": "currentColor",
        "d": "M256 48C141.31 48 48 141.31 48 256s93.31 208 208 208s208-93.31 208-208S370.69 48 256 48m108.25 138.29l-134.4 160a16 16 0 0 1-12 5.71h-.27a16 16 0 0 1-11.89-5.3l-57.6-64a16 16 0 1 1 23.78-21.4l45.29 50.32l122.59-145.91a16 16 0 0 1 24.5 20.58"
      }
    ]
  ],
  "chevron-down-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "48",
        "d": "m112 184l144 144l144-144"
      }
    ]
  ],
  "chevron-back-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "48",
        "d": "M328 112L184 256l144 144"
      }
    ]
  ],
  "chevron-forward-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "48",
        "d": "m184 112l144 144l-144 144"
      }
    ]
  ],
  "chevron-up-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "48",
        "d": "m112 328l144-144l144 144"
      }
    ]
  ],
  "compass-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M448 256c0-106-86-192-192-192S64 150 64 256s86 192 192 192s192-86 192-192Z"
      }
    ],
    [
      "path",
      {
        "fill": "currentColor",
        "d": "m350.67 150.93l-117.2 46.88a64 64 0 0 0-35.66 35.66l-46.88 117.2a8 8 0 0 0 10.4 10.4l117.2-46.88a64 64 0 0 0 35.66-35.66l46.88-117.2a8 8 0 0 0-10.4-10.4M256 280a24 24 0 1 1 24-24a24 24 0 0 1-24 24"
      }
    ]
  ],
  "copy-outline": [
    [
      "rect",
      {
        "width": "336",
        "height": "336",
        "x": "128",
        "y": "128",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "57",
        "ry": "57"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "m383.5 128l.5-24a56.16 56.16 0 0 0-56-56H112a64.19 64.19 0 0 0-64 64v216a56.16 56.16 0 0 0 56 56h24"
      }
    ]
  ],
  "return-up-forward-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "m400 160l64 64l-64 64"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M448 224H154c-58.76 0-106 49.33-106 108v20"
      }
    ]
  ],
  "trophy-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M176 464h160m-80 0V336m128-112c0-50.64-.08-134.63-.12-160a16 16 0 0 0-16-16l-223.79.26a16 16 0 0 0-16 15.95c0 30.58-.13 129.17-.13 159.79c0 64.28 83 112 128 112S384 288.28 384 224"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M128 96H48v16c0 55.22 33.55 112 80 112M384 96h80v16c0 55.22-33.55 112-80 112"
      }
    ]
  ],
  "backspace-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M135.19 390.14a28.8 28.8 0 0 0 21.68 9.86h246.26A29 29 0 0 0 432 371.13V140.87A29 29 0 0 0 403.13 112H156.87a28.84 28.84 0 0 0-21.67 9.84L46.33 256l88.86 134.11Z"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M336.67 192.33L206.66 322.34m130.01 0L206.66 192.33m130.01 0L206.66 322.34m130.01 0L206.66 192.33"
      }
    ]
  ],
  "download-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M336 176h40a40 40 0 0 1 40 40v208a40 40 0 0 1-40 40H136a40 40 0 0 1-40-40V216a40 40 0 0 1 40-40h40"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "m176 272l80 80l80-80M256 48v288"
      }
    ]
  ],
  "bandage-outline": [
    [
      "rect",
      {
        "width": "560.87",
        "height": "176.25",
        "x": "-24.43",
        "y": "167.88",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "88.12",
        "ry": "88.12",
        "transform": "rotate(-45 256 256.002)"
      }
    ],
    [
      "rect",
      {
        "width": "176",
        "height": "196",
        "x": "169.41",
        "y": "156.59",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "32",
        "ry": "32",
        "transform": "rotate(45 257.409 254.582)"
      }
    ],
    [
      "circle",
      {
        "cx": "256",
        "cy": "208",
        "r": "16",
        "fill": "currentColor"
      }
    ],
    [
      "circle",
      {
        "cx": "304",
        "cy": "256",
        "r": "16",
        "fill": "currentColor"
      }
    ],
    [
      "circle",
      {
        "cx": "208",
        "cy": "256",
        "r": "16",
        "fill": "currentColor"
      }
    ],
    [
      "circle",
      {
        "cx": "256",
        "cy": "304",
        "r": "16",
        "fill": "currentColor"
      }
    ]
  ],
  "open-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M384 224v184a40 40 0 0 1-40 40H104a40 40 0 0 1-40-40V168a40 40 0 0 1 40-40h167.48M336 64h112v112M224 288L440 72"
      }
    ]
  ],
  "eye-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M255.66 112c-77.94 0-157.89 45.11-220.83 135.33a16 16 0 0 0-.27 17.77C82.92 340.8 161.8 400 255.66 400c92.84 0 173.34-59.38 221.79-135.25a16.14 16.14 0 0 0 0-17.47C428.89 172.28 347.8 112 255.66 112"
      }
    ],
    [
      "circle",
      {
        "cx": "256",
        "cy": "256",
        "r": "80",
        "fill": "none",
        "stroke": "currentColor",
        "strokeMiterlimit": "10",
        "strokeWidth": "32"
      }
    ]
  ],
  "eye-off-outline": [
    [
      "path",
      {
        "fill": "currentColor",
        "d": "M432 448a15.92 15.92 0 0 1-11.31-4.69l-352-352a16 16 0 0 1 22.62-22.62l352 352A16 16 0 0 1 432 448m-176.34-64c-41.49 0-81.5-12.28-118.92-36.5c-34.07-22-64.74-53.51-88.7-91v-.08c19.94-28.57 41.78-52.73 65.24-72.21a2 2 0 0 0 .14-2.94L93.5 161.38a2 2 0 0 0-2.71-.12c-24.92 21-48.05 46.76-69.08 76.92a31.92 31.92 0 0 0-.64 35.54c26.41 41.33 60.4 76.14 98.28 100.65C162 402 207.9 416 255.66 416a239.1 239.1 0 0 0 75.8-12.58a2 2 0 0 0 .77-3.31l-21.58-21.58a4 4 0 0 0-3.83-1a204.8 204.8 0 0 1-51.16 6.47m235.18-145.4c-26.46-40.92-60.79-75.68-99.27-100.53C349 110.55 302 96 255.66 96a227.3 227.3 0 0 0-74.89 12.83a2 2 0 0 0-.75 3.31l21.55 21.55a4 4 0 0 0 3.88 1a192.8 192.8 0 0 1 50.21-6.69c40.69 0 80.58 12.43 118.55 37c34.71 22.4 65.74 53.88 89.76 91a.13.13 0 0 1 0 .16a310.7 310.7 0 0 1-64.12 72.73a2 2 0 0 0-.15 2.95l19.9 19.89a2 2 0 0 0 2.7.13a343.5 343.5 0 0 0 68.64-78.48a32.2 32.2 0 0 0-.1-34.78"
      }
    ],
    [
      "path",
      {
        "fill": "currentColor",
        "d": "M256 160a96 96 0 0 0-21.37 2.4a2 2 0 0 0-1 3.38l112.59 112.56a2 2 0 0 0 3.38-1A96 96 0 0 0 256 160m-90.22 73.66a2 2 0 0 0-3.38 1a96 96 0 0 0 115 115a2 2 0 0 0 1-3.38Z"
      }
    ]
  ],
  "create-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M384 224v184a40 40 0 0 1-40 40H104a40 40 0 0 1-40-40V168a40 40 0 0 1 40-40h167.48"
      }
    ],
    [
      "path",
      {
        "fill": "currentColor",
        "d": "M459.94 53.25a16.06 16.06 0 0 0-23.22-.56L424.35 65a8 8 0 0 0 0 11.31l11.34 11.32a8 8 0 0 0 11.34 0l12.06-12c6.1-6.09 6.67-16.01.85-22.38M399.34 90L218.82 270.2a9 9 0 0 0-2.31 3.93L208.16 299a3.91 3.91 0 0 0 4.86 4.86l24.85-8.35a9 9 0 0 0 3.93-2.31L422 112.66a9 9 0 0 0 0-12.66l-9.95-10a9 9 0 0 0-12.71 0"
      }
    ]
  ],
  "document-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M416 221.25V416a48 48 0 0 1-48 48H144a48 48 0 0 1-48-48V96a48 48 0 0 1 48-48h98.75a32 32 0 0 1 22.62 9.37l141.26 141.26a32 32 0 0 1 9.37 22.62Z"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M256 56v120a32 32 0 0 0 32 32h120"
      }
    ]
  ],
  "document-text-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M416 221.25V416a48 48 0 0 1-48 48H144a48 48 0 0 1-48-48V96a48 48 0 0 1 48-48h98.75a32 32 0 0 1 22.62 9.37l141.26 141.26a32 32 0 0 1 9.37 22.62Z"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M256 56v120a32 32 0 0 0 32 32h120m-232 80h160m-160 80h160"
      }
    ]
  ],
  "film-outline": [
    [
      "rect",
      {
        "width": "416",
        "height": "320",
        "x": "48",
        "y": "96",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "28",
        "ry": "28"
      }
    ],
    [
      "rect",
      {
        "width": "80",
        "height": "80",
        "x": "384",
        "y": "336",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "28",
        "ry": "28"
      }
    ],
    [
      "rect",
      {
        "width": "80",
        "height": "80",
        "x": "384",
        "y": "256",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "28",
        "ry": "28"
      }
    ],
    [
      "rect",
      {
        "width": "80",
        "height": "80",
        "x": "384",
        "y": "176",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "28",
        "ry": "28"
      }
    ],
    [
      "rect",
      {
        "width": "80",
        "height": "80",
        "x": "384",
        "y": "96",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "28",
        "ry": "28"
      }
    ],
    [
      "rect",
      {
        "width": "80",
        "height": "80",
        "x": "48",
        "y": "336",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "28",
        "ry": "28"
      }
    ],
    [
      "rect",
      {
        "width": "80",
        "height": "80",
        "x": "48",
        "y": "256",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "28",
        "ry": "28"
      }
    ],
    [
      "rect",
      {
        "width": "80",
        "height": "80",
        "x": "48",
        "y": "176",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "28",
        "ry": "28"
      }
    ],
    [
      "rect",
      {
        "width": "80",
        "height": "80",
        "x": "48",
        "y": "96",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "28",
        "ry": "28"
      }
    ],
    [
      "rect",
      {
        "width": "256",
        "height": "160",
        "x": "128",
        "y": "96",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "28",
        "ry": "28"
      }
    ],
    [
      "rect",
      {
        "width": "256",
        "height": "160",
        "x": "128",
        "y": "256",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "28",
        "ry": "28"
      }
    ]
  ],
  "flag-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M80 464V68.14a8 8 0 0 1 4-6.9C91.81 56.66 112.92 48 160 48c64 0 145 48 192 48a199.5 199.5 0 0 0 77.23-15.77a2 2 0 0 1 2.77 1.85v219.36a4 4 0 0 1-2.39 3.65C421.37 308.7 392.33 320 352 320c-48 0-128-32-192-32s-80 16-80 16"
      }
    ]
  ],
  "globe-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M256 48C141.13 48 48 141.13 48 256s93.13 208 208 208s208-93.13 208-208S370.87 48 256 48Z"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M256 48c-58.07 0-112.67 93.13-112.67 208S197.93 464 256 464s112.67-93.13 112.67-208S314.07 48 256 48Z"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M117.33 117.33c38.24 27.15 86.38 43.34 138.67 43.34s100.43-16.19 138.67-43.34m0 277.34c-38.24-27.15-86.38-43.34-138.67-43.34s-100.43 16.19-138.67 43.34"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M256 48v416m208-208H48"
      }
    ]
  ],
  "school-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M32 192L256 64l224 128l-224 128z"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M112 240v128l144 80l144-80V240m80 128V192M256 320v128"
      }
    ]
  ],
  "pound": [
    [
      "path",
      {
        "d": "M125.2 352.3H32v-54.6h101.2l13.1-83.3H47v-54.6h107.2L176 32h63.9l-21.8 127.7h105.6L345.5 32h63.1l-21.8 127.7H480v54.6H378.1l-12.3 83.3H465v54.6H358.5L336 480h-63.1l21.8-127.7H188.3L166.5 480h-63.1l21.8-127.7zm84.2-138L197 297.7h105.6l12.3-83.3H209.4z",
        "fill": "currentColor"
      }
    ]
  ],
  "heart-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M352.92 80C288 80 256 144 256 144s-32-64-96.92-64c-52.76 0-94.54 44.14-95.08 96.81c-1.1 109.33 86.73 187.08 183 252.42a16 16 0 0 0 18 0c96.26-65.34 184.09-143.09 183-252.42c-.54-52.67-42.32-96.81-95.08-96.81"
      }
    ]
  ],
  "heart": [
    [
      "path",
      {
        "fill": "currentColor",
        "d": "M256 448a32 32 0 0 1-18-5.57c-78.59-53.35-112.62-89.93-131.39-112.8c-40-48.75-59.15-98.8-58.61-153C48.63 114.52 98.46 64 159.08 64c44.08 0 74.61 24.83 92.39 45.51a6 6 0 0 0 9.06 0C278.31 88.81 308.84 64 352.92 64c60.62 0 110.45 50.52 111.08 112.64c.54 54.21-18.63 104.26-58.61 153c-18.77 22.87-52.8 59.45-131.39 112.8a32 32 0 0 1-18 5.56"
      }
    ]
  ],
  "color-wand-outline": [
    [
      "rect",
      {
        "width": "63.03",
        "height": "378.2",
        "x": "280.48",
        "y": "122.9",
        "fill": "none",
        "stroke": "currentColor",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "rx": "31.52",
        "transform": "rotate(-45 312.002 311.994)"
      }
    ],
    [
      "path",
      {
        "fill": "currentColor",
        "d": "M178.38 178.38a31.64 31.64 0 0 0 0 44.75L223.25 268L268 223.25l-44.87-44.87a31.64 31.64 0 0 0-44.75 0"
      }
    ],
    [
      "path",
      {
        "fill": "currentColor",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M48 192h48M90.18 90.18l33.94 33.94M192 48v48m101.82-5.82l-33.94 33.94M124.12 259.88l-33.94 33.94"
      }
    ]
  ],
  "image-outline": [
    [
      "rect",
      {
        "width": "416",
        "height": "352",
        "x": "48",
        "y": "80",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "48",
        "ry": "48"
      }
    ],
    [
      "circle",
      {
        "cx": "336",
        "cy": "176",
        "r": "32",
        "fill": "none",
        "stroke": "currentColor",
        "strokeMiterlimit": "10",
        "strokeWidth": "32"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "m304 335.79l-90.66-90.49a32 32 0 0 0-43.87-1.3L48 352m176 80l123.34-123.34a32 32 0 0 1 43.11-2L464 368"
      }
    ]
  ],
  "information-circle-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M248 64C146.39 64 64 146.39 64 248s82.39 184 184 184s184-82.39 184-184S349.61 64 248 64Z"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M220 220h32v116"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M208 340h88"
      }
    ],
    [
      "path",
      {
        "fill": "currentColor",
        "d": "M248 130a26 26 0 1 0 26 26a26 26 0 0 0-26-26"
      }
    ]
  ],
  "key-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M218.1 167.17c0 13 0 25.6 4.1 37.4c-43.1 50.6-156.9 184.3-167.5 194.5a20.17 20.17 0 0 0-6.7 15c0 8.5 5.2 16.7 9.6 21.3c6.6 6.9 34.8 33 40 28c15.4-15 18.5-19 24.8-25.2c9.5-9.3-1-28.3 2.3-36s6.8-9.2 12.5-10.4s15.8 2.9 23.7 3c8.3.1 12.8-3.4 19-9.2c5-4.6 8.6-8.9 8.7-15.6c.2-9-12.8-20.9-3.1-30.4s23.7 6.2 34 5s22.8-15.5 24.1-21.6s-11.7-21.8-9.7-30.7c.7-3 6.8-10 11.4-11s25 6.9 29.6 5.9c5.6-1.2 12.1-7.1 17.4-10.4c15.5 6.7 29.6 9.4 47.7 9.4c68.5 0 124-53.4 124-119.2S408.5 48 340 48s-121.9 53.37-121.9 119.17ZM400 144a32 32 0 1 1-32-32a32 32 0 0 1 32 32Z"
      }
    ]
  ],
  "language-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M48 112h288M192 64v48m80 336l96-224l96 224m-162.5-64h133M281.3 112S257 206 199 277S80 384 80 384"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M256 336s-35-27-72-75s-56-85-56-85"
      }
    ]
  ],
  "grid-outline": [
    [
      "rect",
      {
        "width": "176",
        "height": "176",
        "x": "48",
        "y": "48",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "20",
        "ry": "20"
      }
    ],
    [
      "rect",
      {
        "width": "176",
        "height": "176",
        "x": "288",
        "y": "48",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "20",
        "ry": "20"
      }
    ],
    [
      "rect",
      {
        "width": "176",
        "height": "176",
        "x": "48",
        "y": "288",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "20",
        "ry": "20"
      }
    ],
    [
      "rect",
      {
        "width": "176",
        "height": "176",
        "x": "288",
        "y": "288",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "20",
        "ry": "20"
      }
    ]
  ],
  "link-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "36",
        "d": "M208 352h-64a96 96 0 0 1 0-192h64m96 0h64a96 96 0 0 1 0 192h-64m-140.71-96h187.42"
      }
    ]
  ],
  "load-c": [
    [
      "path",
      {
        "d": "M479.8 226.1c-1.4-8.7-3.1-17.3-5.3-25.8-2.8-10.8-6.4-21.5-10.8-31.8-8.9-21.2-21.1-41-35.9-58.6-16-18.9-35.3-35.2-56.7-47.7C350 49.8 327 41 303 36.1c-12.4-2.5-24.9-4-37.6-4.1-9.9-.1-19.8.3-29.6 1.2-25.5 2.5-50.7 9.6-73.9 20.5-19.9 9.4-38.4 21.6-54.8 36.2-16.4 14.6-30.7 31.6-42.2 50.3-12.7 20.8-22.2 43.5-27.4 67.3-4.2 19-6.2 38.6-5.2 58.1.9 18.9 3.8 37.8 9.5 55.9 3.6 11.5 7.9 22.7 13.3 33.6 5.3 10.7 11.5 21 18.4 30.7 13.8 19.3 30.6 36.4 49.8 50.5 19.6 14.5 41.7 25.7 64.9 33.1 24.2 7.7 49.9 11.3 75.3 10.4 24.8-.8 49.4-5.6 72.6-14.5 22.3-8.6 43.2-20.9 61.5-36.3 9.2-7.8 17.4-16.6 25.1-25.9 7.8-9.4 14.8-19.3 20.6-30 5-9.2 9.2-18.8 12.8-28.5 1.8-4.8 3.5-9.6 4.9-14.6 1.5-5.3 2.6-10.8 3.6-16.2 1.5-8.5 2.1-17.3 1.3-25.9-.7 3.8-1.3 7.5-2.2 11.2-1.1 4.3-2.5 8.5-4.1 12.6-3.2 8.7-7.2 17.1-11 25.5-4.9 10.7-10.6 20.9-16.8 30.8-3.2 5.1-6.5 10.1-10.1 14.9-3.6 4.8-7.7 9.4-11.8 13.9-8.2 9.1-17.1 17.2-27 24.4-10.1 7.4-20.8 13.9-32.1 19.3-22.6 11-47.3 17.6-72.3 19.8-25.6 2.2-51.7-.3-76.3-7.6-23.4-6.9-45.6-18.1-65.1-32.8-18.9-14.3-35.3-31.9-48.2-51.8C75.4 347.8 66.1 324.9 61 301c-1.3-6.2-2.3-12.6-3-18.9-.6-5.4-1.1-10.9-1.3-16.4-.3-11.3.4-23 2.1-34.2 3.7-24.6 11.7-48.3 24.1-69.9 11-19.3 25.3-36.7 42.1-51.4 16.8-14.8 36-26.7 56.8-35.1 12-4.9 24.6-8.5 37.4-10.9 6.5-1.2 13-2.2 19.5-2.7 3.2-.3 6.3-.3 9.5-.6 1.3 0 2.6.1 3.9.1 21.7-.4 43.5 2.4 64.2 8.9 22.3 7 43.3 18.3 61.5 33 19.1 15.4 35 34.4 47 55.8 10.2 18.2 17.5 37.8 21.9 58.2 1 4.7 1.8 9.4 2.6 14.1.7 4.3 3.1 8.3 6.8 10.7 7.8 5.2 18.7 1.7 22.5-6.7 1.3-2.9 1.7-6 1.2-8.9z",
        "fill": "currentColor"
      }
    ]
  ],
  "locate-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "48",
        "d": "M256 96V56m0 400v-40"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M256 112a144 144 0 1 0 144 144a144 144 0 0 0-144-144Z"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "48",
        "d": "M416 256h40m-400 0h40"
      }
    ]
  ],
  "lock-closed-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M336 208v-95a80 80 0 0 0-160 0v95"
      }
    ],
    [
      "rect",
      {
        "width": "320",
        "height": "272",
        "x": "96",
        "y": "208",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "48",
        "ry": "48"
      }
    ]
  ],
  "log-out-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M304 336v40a40 40 0 0 1-40 40H104a40 40 0 0 1-40-40V136a40 40 0 0 1 40-40h152c22.09 0 48 17.91 48 40v40m64 160l80-80l-80-80m-192 80h256"
      }
    ]
  ],
  "mail-outline": [
    [
      "rect",
      {
        "width": "416",
        "height": "320",
        "x": "48",
        "y": "96",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "40",
        "ry": "40"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "m112 160l144 112l144-112"
      }
    ]
  ],
  "mail-open-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M441.6 171.61L266.87 85.37a24.57 24.57 0 0 0-21.74 0L70.4 171.61A40 40 0 0 0 48 207.39V392c0 22.09 18.14 40 40.52 40h335c22.38 0 40.52-17.91 40.52-40V207.39a40 40 0 0 0-22.44-35.78"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M397.33 368L268.07 267.46a24 24 0 0 0-29.47 0L109.33 368m200-73l136-103m-384 0l139 105"
      }
    ]
  ],
  "location-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M256 48c-79.5 0-144 61.39-144 137c0 87 96 224.87 131.25 272.49a15.77 15.77 0 0 0 25.5 0C304 409.89 400 272.07 400 185c0-75.61-64.5-137-144-137"
      }
    ],
    [
      "circle",
      {
        "cx": "256",
        "cy": "192",
        "r": "48",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32"
      }
    ]
  ],
  "menu-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M80 160h352M80 256h352M80 352h352"
      }
    ]
  ],
  "chatbubble-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M87.49 380c1.19-4.38-1.44-10.47-3.95-14.86a45 45 0 0 0-2.54-3.8a199.8 199.8 0 0 1-33-110C47.65 139.09 140.73 48 255.83 48C356.21 48 440 117.54 459.58 209.85a199 199 0 0 1 4.42 41.64c0 112.41-89.49 204.93-204.59 204.93c-18.3 0-43-4.6-56.47-8.37s-26.92-8.77-30.39-10.11a31.1 31.1 0 0 0-11.12-2.07a30.7 30.7 0 0 0-12.09 2.43l-67.83 24.48a16 16 0 0 1-4.67 1.22a9.6 9.6 0 0 1-9.57-9.74a16 16 0 0 1 .6-3.29Z"
      }
    ]
  ],
  "chatbox-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M408 64H104a56.16 56.16 0 0 0-56 56v192a56.16 56.16 0 0 0 56 56h40v80l93.72-78.14a8 8 0 0 1 5.13-1.86H408a56.16 56.16 0 0 0 56-56V120a56.16 56.16 0 0 0-56-56Z"
      }
    ]
  ],
  "mic-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M192 448h128m64-240v32c0 70.4-57.6 128-128 128h0c-70.4 0-128-57.6-128-128v-32m128 160v80"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M256 64a63.68 63.68 0 0 0-64 64v111c0 35.2 29 65 64 65s64-29 64-65V128c0-36-28-64-64-64"
      }
    ]
  ],
  "mic-off-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M432 400L96 64"
      }
    ],
    [
      "path",
      {
        "fill": "currentColor",
        "d": "M400 240v-31.55c0-8.61-6.62-16-15.23-16.43A16 16 0 0 0 368 208v32a111.6 111.6 0 0 1-2.45 23.31a4.05 4.05 0 0 0 1.07 3.69l21.82 21.81a2 2 0 0 0 3.29-.72A143.3 143.3 0 0 0 400 240M256 352a112.36 112.36 0 0 1-112-112v-31.55c0-8.61-6.62-16-15.23-16.43A16 16 0 0 0 112 208v32c0 74 56.1 135.12 128 143.11V432h-47.55c-8.61 0-16 6.62-16.43 15.23A16 16 0 0 0 192 464h127.55c8.61 0 16-6.62 16.43-15.23A16 16 0 0 0 320 432h-48v-48.89a143.1 143.1 0 0 0 52-16.22a4 4 0 0 0 .91-6.35L307 342.63a4 4 0 0 0-4.51-.78A110.8 110.8 0 0 1 256 352m0-272a47.18 47.18 0 0 1 48 48v74.72a4 4 0 0 0 1.17 2.82L332.59 233a2 2 0 0 0 3.41-1.42V128.91C336 85 301 48.6 257.14 48a79.66 79.66 0 0 0-68.47 36.57a4 4 0 0 0 .54 5l19.54 19.54a2 2 0 0 0 3.25-.63A47.44 47.44 0 0 1 256 80"
      }
    ],
    [
      "path",
      {
        "fill": "currentColor",
        "d": "M207.27 242.9L179.41 215a2 2 0 0 0-3.41 1.42V239a80.9 80.9 0 0 0 23.45 56.9a78.55 78.55 0 0 0 77.8 21.19a2 2 0 0 0 .86-3.35l-24.91-24.91a4.08 4.08 0 0 0-2.42-1.15c-21.65-2.52-39.48-20.44-42.37-42.43a4 4 0 0 0-1.14-2.35"
      }
    ]
  ],
  "remove-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M400 256H112"
      }
    ]
  ],
  "desktop-outline": [
    [
      "rect",
      {
        "width": "448",
        "height": "320",
        "x": "32",
        "y": "64",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "32",
        "ry": "32"
      }
    ],
    [
      "path",
      {
        "fill": "currentColor",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "m304 448l-8-64h-80l-8 64z"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M368 448H144"
      }
    ],
    [
      "path",
      {
        "fill": "currentColor",
        "d": "M32 304v48a32.09 32.09 0 0 0 32 32h384a32.09 32.09 0 0 0 32-32v-48Zm224 64a16 16 0 1 1 16-16a16 16 0 0 1-16 16"
      }
    ]
  ],
  "ellipsis-horizontal": [
    [
      "circle",
      {
        "cx": "256",
        "cy": "256",
        "r": "48",
        "fill": "currentColor"
      }
    ],
    [
      "circle",
      {
        "cx": "416",
        "cy": "256",
        "r": "48",
        "fill": "currentColor"
      }
    ],
    [
      "circle",
      {
        "cx": "96",
        "cy": "256",
        "r": "48",
        "fill": "currentColor"
      }
    ]
  ],
  "ellipsis-vertical": [
    [
      "circle",
      {
        "cx": "256",
        "cy": "256",
        "r": "48",
        "fill": "currentColor"
      }
    ],
    [
      "circle",
      {
        "cx": "256",
        "cy": "416",
        "r": "48",
        "fill": "currentColor"
      }
    ],
    [
      "circle",
      {
        "cx": "256",
        "cy": "96",
        "r": "48",
        "fill": "currentColor"
      }
    ]
  ],
  "musical-notes-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M192 218v-6c0-14.84 10-27 24.24-30.59l174.59-46.68A20 20 0 0 1 416 154v22"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M416 295.94v80c0 13.91-8.93 25.59-22 30l-22 8c-25.9 8.72-52-10.42-52-38h0a33.37 33.37 0 0 1 23-32l51-18.15c13.07-4.4 22-15.94 22-29.85V58a10 10 0 0 0-12.6-9.61L204 102a16.48 16.48 0 0 0-12 16v226c0 13.91-8.93 25.6-22 30l-52 18c-13.88 4.68-22 17.22-22 32h0c0 27.58 26.52 46.55 52 38l22-8c13.07-4.4 22-16.08 22-30v-80"
      }
    ]
  ],
  "newspaper-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M368 415.86V72a24.07 24.07 0 0 0-24-24H72a24.07 24.07 0 0 0-24 24v352a40.12 40.12 0 0 0 40 40h328"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M416 464a48 48 0 0 1-48-48V128h72a24 24 0 0 1 24 24v264a48 48 0 0 1-48 48Z"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M240 128h64m-64 64h64m-192 64h192m-192 64h192m-192 64h192"
      }
    ],
    [
      "path",
      {
        "fill": "currentColor",
        "d": "M176 208h-64a16 16 0 0 1-16-16v-64a16 16 0 0 1 16-16h64a16 16 0 0 1 16 16v64a16 16 0 0 1-16 16"
      }
    ]
  ],
  "pause-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M176 96h16v320h-16zm144 0h16v320h-16z"
      }
    ]
  ],
  "pause": [
    [
      "path",
      {
        "fill": "currentColor",
        "d": "M208 432h-48a16 16 0 0 1-16-16V96a16 16 0 0 1 16-16h48a16 16 0 0 1 16 16v320a16 16 0 0 1-16 16m144 0h-48a16 16 0 0 1-16-16V96a16 16 0 0 1 16-16h48a16 16 0 0 1 16 16v320a16 16 0 0 1-16 16"
      }
    ]
  ],
  "brush-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M452.37 59.63a40.49 40.49 0 0 0-57.26 0L184 294.74c23.08 4.7 46.12 27.29 49.26 49.26l219.11-227.11a40.49 40.49 0 0 0 0-57.26M138 336c-29.88 0-54 24.5-54 54.86c0 23.95-20.88 36.57-36 36.57C64.56 449.74 92.82 464 120 464c39.78 0 72-32.73 72-73.14c0-30.36-24.12-54.86-54-54.86"
      }
    ]
  ],
  "pencil-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M364.13 125.25L87 403l-23 45l44.99-23l277.76-277.13zm56.56-56.56l-22.62 22.62l22.62 22.63l22.62-22.63a16 16 0 0 0 0-22.62h0a16 16 0 0 0-22.62 0"
      }
    ]
  ],
  "call-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M451 374c-15.88-16-54.34-39.35-73-48.76c-24.3-12.24-26.3-13.24-45.4.95c-12.74 9.47-21.21 17.93-36.12 14.75s-47.31-21.11-75.68-49.39s-47.34-61.62-50.53-76.48s5.41-23.23 14.79-36c13.22-18 12.22-21 .92-45.3c-8.81-18.9-32.84-57-48.9-72.8C119.9 44 119.9 47 108.83 51.6A160 160 0 0 0 83 65.37C67 76 58.12 84.83 51.91 98.1s-9 44.38 23.07 102.64s54.57 88.05 101.14 134.49S258.5 406.64 310.85 436c64.76 36.27 89.6 29.2 102.91 23s22.18-15 32.83-31a159 159 0 0 0 13.8-25.8C465 391.17 468 391.17 451 374Z"
      }
    ]
  ],
  "call-sharp": [
    [
      "path",
      {
        "fill": "currentColor",
        "d": "M478.94 370.14c-5.22-5.56-23.65-22-57.53-43.75c-34.13-21.94-59.3-35.62-66.52-38.81a3.83 3.83 0 0 0-3.92.49c-11.63 9.07-31.21 25.73-32.26 26.63c-6.78 5.81-6.78 5.81-12.33 4c-9.76-3.2-40.08-19.3-66.5-45.78s-43.35-57.55-46.55-67.3c-1.83-5.56-1.83-5.56 4-12.34c.9-1.05 17.57-20.63 26.64-32.25a3.83 3.83 0 0 0 .49-3.92c-3.19-7.23-16.87-32.39-38.81-66.52c-21.78-33.87-38.2-52.3-43.76-57.52a3.9 3.9 0 0 0-3.89-.87a322.4 322.4 0 0 0-56 25.45A338 338 0 0 0 33.35 92a3.83 3.83 0 0 0-1.26 3.74c2.09 9.74 12.08 50.4 43.08 106.72c31.63 57.48 53.55 86.93 100 133.22S252 405.21 309.54 436.84c56.32 31 97 41 106.72 43.07a3.86 3.86 0 0 0 3.75-1.26A337.7 337.7 0 0 0 454.35 430a322.7 322.7 0 0 0 25.45-56a3.9 3.9 0 0 0-.86-3.86"
      }
    ]
  ],
  "pin-outline": [
    [
      "circle",
      {
        "cx": "256",
        "cy": "96",
        "r": "64",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32"
      }
    ],
    [
      "path",
      {
        "fill": "currentColor",
        "d": "M272 164a9 9 0 0 0-9-9h-14a9 9 0 0 0-9 9v293.56a32.1 32.1 0 0 0 2.49 12.38l10.07 24a3.92 3.92 0 0 0 6.88 0l10.07-24a32.1 32.1 0 0 0 2.49-12.38Z"
      }
    ],
    [
      "circle",
      {
        "cx": "280",
        "cy": "72",
        "r": "24",
        "fill": "currentColor"
      }
    ]
  ],
  "pin-sharp": [
    [
      "path",
      {
        "fill": "currentColor",
        "d": "M339 99a83 83 0 1 0-102 80.8V464l19 32l19-32V179.8A83.28 83.28 0 0 0 339 99m-59-6a21 21 0 1 1 21-21a21 21 0 0 1-21 21"
      }
    ]
  ],
  "play-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M112 111v290c0 17.44 17 28.52 31 20.16l247.9-148.37c12.12-7.25 12.12-26.33 0-33.58L143 90.84c-14-8.36-31 2.72-31 20.16Z"
      }
    ]
  ],
  "play": [
    [
      "path",
      {
        "fill": "currentColor",
        "d": "M133 440a35.37 35.37 0 0 1-17.5-4.67c-12-6.8-19.46-20-19.46-34.33V111c0-14.37 7.46-27.53 19.46-34.33a35.13 35.13 0 0 1 35.77.45l247.85 148.36a36 36 0 0 1 0 61l-247.89 148.4A35.5 35.5 0 0 1 133 440"
      }
    ]
  ],
  "add-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M256 112v288m144-144H112"
      }
    ]
  ],
  "qr-code-outline": [
    [
      "rect",
      {
        "width": "80",
        "height": "80",
        "x": "336",
        "y": "336",
        "fill": "currentColor",
        "rx": "8",
        "ry": "8"
      }
    ],
    [
      "rect",
      {
        "width": "64",
        "height": "64",
        "x": "272",
        "y": "272",
        "fill": "currentColor",
        "rx": "8",
        "ry": "8"
      }
    ],
    [
      "rect",
      {
        "width": "64",
        "height": "64",
        "x": "416",
        "y": "416",
        "fill": "currentColor",
        "rx": "8",
        "ry": "8"
      }
    ],
    [
      "rect",
      {
        "width": "48",
        "height": "48",
        "x": "432",
        "y": "272",
        "fill": "currentColor",
        "rx": "8",
        "ry": "8"
      }
    ],
    [
      "rect",
      {
        "width": "48",
        "height": "48",
        "x": "272",
        "y": "432",
        "fill": "currentColor",
        "rx": "8",
        "ry": "8"
      }
    ],
    [
      "rect",
      {
        "width": "80",
        "height": "80",
        "x": "336",
        "y": "96",
        "fill": "currentColor",
        "rx": "8",
        "ry": "8"
      }
    ],
    [
      "rect",
      {
        "width": "176",
        "height": "176",
        "x": "288",
        "y": "48",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "16",
        "ry": "16"
      }
    ],
    [
      "rect",
      {
        "width": "80",
        "height": "80",
        "x": "96",
        "y": "96",
        "fill": "currentColor",
        "rx": "8",
        "ry": "8"
      }
    ],
    [
      "rect",
      {
        "width": "176",
        "height": "176",
        "x": "48",
        "y": "48",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "16",
        "ry": "16"
      }
    ],
    [
      "rect",
      {
        "width": "80",
        "height": "80",
        "x": "96",
        "y": "336",
        "fill": "currentColor",
        "rx": "8",
        "ry": "8"
      }
    ],
    [
      "rect",
      {
        "width": "176",
        "height": "176",
        "x": "48",
        "y": "288",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "rx": "16",
        "ry": "16"
      }
    ]
  ],
  "radio-outline": [
    [
      "circle",
      {
        "cx": "256",
        "cy": "256.02",
        "r": "32",
        "fill": "currentColor"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M184.25 192.25a96 96 0 0 0 0 127.52m143.52 0a96 96 0 0 0 0-127.52m-194.49-50.97a168 168 0 0 0 0 229.44m245.44 0a168 168 0 0 0 0-229.44"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M435 416a240.34 240.34 0 0 0 0-320M77 96a240.34 240.34 0 0 0 0 320"
      }
    ]
  ],
  "refresh-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M320 146s24.36-12-64-12a160 160 0 1 0 160 160"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "m256 58l80 80l-80 80"
      }
    ]
  ],
  "repeat-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "m320 120l48 48l-48 48"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M352 168H144a80.24 80.24 0 0 0-80 80v16m128 128l-48-48l48-48"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M160 344h208a80.24 80.24 0 0 0 80-80v-16"
      }
    ]
  ],
  "reload-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "m400 148l-21.12-24.57A191.43 191.43 0 0 0 240 64C134 64 48 150 48 256s86 192 192 192a192.09 192.09 0 0 0 181.07-128"
      }
    ],
    [
      "path",
      {
        "fill": "currentColor",
        "d": "M464 97.42V208a16 16 0 0 1-16 16H337.42c-14.26 0-21.4-17.23-11.32-27.31L436.69 86.1C446.77 76 464 83.16 464 97.42"
      }
    ]
  ],
  "save-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M380.93 57.37A32 32 0 0 0 358.3 48H94.22A46.21 46.21 0 0 0 48 94.22v323.56A46.21 46.21 0 0 0 94.22 464h323.56A46.36 46.36 0 0 0 464 417.78V153.7a32 32 0 0 0-9.37-22.63ZM256 416a64 64 0 1 1 64-64a63.92 63.92 0 0 1-64 64m48-224H112a16 16 0 0 1-16-16v-64a16 16 0 0 1 16-16h192a16 16 0 0 1 16 16v64a16 16 0 0 1-16 16"
      }
    ]
  ],
  "scan-circle-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M448 256c0-106-86-192-192-192S64 150 64 256s86 192 192 192s192-86 192-192Z"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M296 352h28a28 28 0 0 0 28-28v-28m0-80v-28a28 28 0 0 0-28-28h-28m-80 192h-28a28 28 0 0 1-28-28v-28m0-80v-28a28 28 0 0 1 28-28h28"
      }
    ]
  ],
  "scan-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M336 448h56a56 56 0 0 0 56-56v-56m0-160v-56a56 56 0 0 0-56-56h-56M176 448h-56a56 56 0 0 1-56-56v-56m0-160v-56a56 56 0 0 1 56-56h56"
      }
    ]
  ],
  "search-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M221.09 64a157.09 157.09 0 1 0 157.09 157.09A157.1 157.1 0 0 0 221.09 64Z"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M338.29 338.29L448 448"
      }
    ]
  ],
  "paper-plane-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "m53.12 199.94l400-151.39a8 8 0 0 1 10.33 10.33l-151.39 400a8 8 0 0 1-15-.34l-67.4-166.09a16 16 0 0 0-10.11-10.11L53.46 215a8 8 0 0 1-.34-15.06M460 52L227 285"
      }
    ]
  ],
  "settings-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M262.29 192.31a64 64 0 1 0 57.4 57.4a64.13 64.13 0 0 0-57.4-57.4M416.39 256a154 154 0 0 1-1.53 20.79l45.21 35.46a10.81 10.81 0 0 1 2.45 13.75l-42.77 74a10.81 10.81 0 0 1-13.14 4.59l-44.9-18.08a16.11 16.11 0 0 0-15.17 1.75A164.5 164.5 0 0 1 325 400.8a15.94 15.94 0 0 0-8.82 12.14l-6.73 47.89a11.08 11.08 0 0 1-10.68 9.17h-85.54a11.11 11.11 0 0 1-10.69-8.87l-6.72-47.82a16.07 16.07 0 0 0-9-12.22a155 155 0 0 1-21.46-12.57a16 16 0 0 0-15.11-1.71l-44.89 18.07a10.81 10.81 0 0 1-13.14-4.58l-42.77-74a10.8 10.8 0 0 1 2.45-13.75l38.21-30a16.05 16.05 0 0 0 6-14.08c-.36-4.17-.58-8.33-.58-12.5s.21-8.27.58-12.35a16 16 0 0 0-6.07-13.94l-38.19-30A10.81 10.81 0 0 1 49.48 186l42.77-74a10.81 10.81 0 0 1 13.14-4.59l44.9 18.08a16.11 16.11 0 0 0 15.17-1.75A164.5 164.5 0 0 1 187 111.2a15.94 15.94 0 0 0 8.82-12.14l6.73-47.89A11.08 11.08 0 0 1 213.23 42h85.54a11.11 11.11 0 0 1 10.69 8.87l6.72 47.82a16.07 16.07 0 0 0 9 12.22a155 155 0 0 1 21.46 12.57a16 16 0 0 0 15.11 1.71l44.89-18.07a10.81 10.81 0 0 1 13.14 4.58l42.77 74a10.8 10.8 0 0 1-2.45 13.75l-38.21 30a16.05 16.05 0 0 0-6.05 14.08c.33 4.14.55 8.3.55 12.47"
      }
    ]
  ],
  "share-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M336 192h40a40 40 0 0 1 40 40v192a40 40 0 0 1-40 40H136a40 40 0 0 1-40-40V232a40 40 0 0 1 40-40h40m160-64l-80-80l-80 80m80 193V48"
      }
    ]
  ],
  "share-social-outline": [
    [
      "circle",
      {
        "cx": "128",
        "cy": "256",
        "r": "48",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32"
      }
    ],
    [
      "circle",
      {
        "cx": "384",
        "cy": "112",
        "r": "48",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32"
      }
    ],
    [
      "circle",
      {
        "cx": "384",
        "cy": "400",
        "r": "48",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "m169.83 279.53l172.34 96.94m0-240.94l-172.34 96.94"
      }
    ]
  ],
  "shield-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M463.1 112.37C373.68 96.33 336.71 84.45 256 48c-80.71 36.45-117.68 48.33-207.1 64.37C32.7 369.13 240.58 457.79 256 464c15.42-6.21 223.3-94.87 207.1-351.63"
      }
    ]
  ],
  "shield-half-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M463.1 112.37C373.68 96.33 336.71 84.45 256 48c-80.71 36.45-117.68 48.33-207.1 64.37C32.7 369.13 240.58 457.79 256 464c15.42-6.21 223.3-94.87 207.1-351.63"
      }
    ],
    [
      "path",
      {
        "fill": "currentColor",
        "d": "M256 48c-80.71 36.45-117.68 48.33-207.1 64.37C32.7 369.13 240.58 457.79 256 464Z"
      }
    ]
  ],
  "shield-checkmark-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M336 176L225.2 304L176 255.8"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M463.1 112.37C373.68 96.33 336.71 84.45 256 48c-80.71 36.45-117.68 48.33-207.1 64.37C32.7 369.13 240.58 457.79 256 464c15.42-6.21 223.3-94.87 207.1-351.63"
      }
    ]
  ],
  "happy-outline": [
    [
      "circle",
      {
        "cx": "184",
        "cy": "232",
        "r": "24",
        "fill": "currentColor"
      }
    ],
    [
      "path",
      {
        "fill": "currentColor",
        "d": "M256.05 384c-45.42 0-83.62-29.53-95.71-69.83a8 8 0 0 1 7.82-10.17h175.69a8 8 0 0 1 7.82 10.17c-11.99 40.3-50.2 69.83-95.62 69.83"
      }
    ],
    [
      "circle",
      {
        "cx": "328",
        "cy": "232",
        "r": "24",
        "fill": "currentColor"
      }
    ],
    [
      "circle",
      {
        "cx": "256",
        "cy": "256",
        "r": "208",
        "fill": "none",
        "stroke": "currentColor",
        "strokeMiterlimit": "10",
        "strokeWidth": "32"
      }
    ]
  ],
  "sparkles-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M259.92 262.91L216.4 149.77a9 9 0 0 0-16.8 0l-43.52 113.14a9 9 0 0 1-5.17 5.17L37.77 311.6a9 9 0 0 0 0 16.8l113.14 43.52a9 9 0 0 1 5.17 5.17l43.52 113.14a9 9 0 0 0 16.8 0l43.52-113.14a9 9 0 0 1 5.17-5.17l113.14-43.52a9 9 0 0 0 0-16.8l-113.14-43.52a9 9 0 0 1-5.17-5.17M108 68L88 16L68 68L16 88l52 20l20 52l20-52l52-20zm318.67 49.33L400 48l-26.67 69.33L304 144l69.33 26.67L400 240l26.67-69.33L496 144z"
      }
    ]
  ],
  "trash-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "m112 112l20 320c.95 18.49 14.4 32 32 32h184c17.67 0 30.87-13.51 32-32l20-320"
      }
    ],
    [
      "path",
      {
        "fill": "currentColor",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M80 112h352"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M192 112V72h0a23.93 23.93 0 0 1 24-24h80a23.93 23.93 0 0 1 24 24h0v40m-64 64v224m-72-224l8 224m136-224l-8 224"
      }
    ]
  ],
  "leaf-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M321.89 171.42C233 114 141 155.22 56 65.22c-19.8-21-8.3 235.5 98.1 332.7c77.79 71 197.9 63.08 238.4-5.92s18.28-163.17-70.61-220.58"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M173 253c86 81 175 129 292 147"
      }
    ]
  ],
  "arrow-undo-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M240 424v-96c116.4 0 159.39 33.76 208 96c0-119.23-39.57-240-208-240V88L64 256Z"
      }
    ]
  ],
  "cloud-upload-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M320 367.79h76c55 0 100-29.21 100-83.6s-53-81.47-96-83.6c-8.89-85.06-71-136.8-144-136.8c-69 0-113.44 45.79-128 91.2c-60 5.7-112 43.88-112 106.4s54 106.4 120 106.4h56"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "m320 255.79l-64-64l-64 64m64 192.42V207.79"
      }
    ]
  ],
  "person-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M344 144c-3.92 52.87-44 96-88 96s-84.15-43.12-88-96c-4-55 35-96 88-96s92 42 88 96"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M256 304c-87 0-175.3 48-191.64 138.6C62.39 453.52 68.57 464 80 464h352c11.44 0 17.62-10.48 15.65-21.4C431.3 352 343 304 256 304Z"
      }
    ]
  ],
  "person-circle-outline": [
    [
      "path",
      {
        "fill": "currentColor",
        "d": "M258.9 48C141.92 46.42 46.42 141.92 48 258.9c1.56 112.19 92.91 203.54 205.1 205.1c117 1.6 212.48-93.9 210.88-210.88C462.44 140.91 371.09 49.56 258.9 48m126.42 327.25a4 4 0 0 1-6.14-.32a124.3 124.3 0 0 0-32.35-29.59C321.37 329 289.11 320 256 320s-65.37 9-90.83 25.34a124.2 124.2 0 0 0-32.35 29.58a4 4 0 0 1-6.14.32A175.32 175.32 0 0 1 80 259c-1.63-97.31 78.22-178.76 175.57-179S432 158.81 432 256a175.32 175.32 0 0 1-46.68 119.25"
      }
    ],
    [
      "path",
      {
        "fill": "currentColor",
        "d": "M256 144c-19.72 0-37.55 7.39-50.22 20.82s-19 32-17.57 51.93C191.11 256 221.52 288 256 288s64.83-32 67.79-71.24c1.48-19.74-4.8-38.14-17.68-51.82C293.39 151.44 275.59 144 256 144"
      }
    ]
  ],
  "person-remove-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M376 144c-3.92 52.87-44 96-88 96s-84.15-43.12-88-96c-4-55 35-96 88-96s92 42 88 96"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M288 304c-87 0-175.3 48-191.64 138.6c-2 10.92 4.21 21.4 15.65 21.4H464c11.44 0 17.62-10.48 15.65-21.4C463.3 352 375 304 288 304Z"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M144 232H32"
      }
    ]
  ],
  "person-add-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M376 144c-3.92 52.87-44 96-88 96s-84.15-43.12-88-96c-4-55 35-96 88-96s92 42 88 96"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M288 304c-87 0-175.3 48-191.64 138.6c-2 10.92 4.21 21.4 15.65 21.4H464c11.44 0 17.62-10.48 15.65-21.4C463.3 352 375 304 288 304Z"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M88 176v112m56-56H32"
      }
    ]
  ],
  "people-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M402 168c-2.93 40.67-33.1 72-66 72s-63.12-31.32-66-72c-3-42.31 26.37-72 66-72s69 30.46 66 72"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M336 304c-65.17 0-127.84 32.37-143.54 95.41c-2.08 8.34 3.15 16.59 11.72 16.59h263.65c8.57 0 13.77-8.25 11.72-16.59C463.85 335.36 401.18 304 336 304Z"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M200 185.94c-2.34 32.48-26.72 58.06-53 58.06s-50.7-25.57-53-58.06C91.61 152.15 115.34 128 147 128s55.39 24.77 53 57.94"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M206 306c-18.05-8.27-37.93-11.45-59-11.45c-52 0-102.1 25.85-114.65 76.2c-1.65 6.66 2.53 13.25 9.37 13.25H154"
      }
    ]
  ],
  "people-circle-outline": [
    [
      "path",
      {
        "fill": "currentColor",
        "d": "M256 464c-114.69 0-208-93.31-208-208S141.31 48 256 48s208 93.31 208 208s-93.31 208-208 208m0-384c-97 0-176 79-176 176s79 176 176 176s176-78.95 176-176S353.05 80 256 80"
      }
    ],
    [
      "path",
      {
        "fill": "currentColor",
        "d": "M323.67 292c-17.4 0-34.21-7.72-47.34-21.73a83.76 83.76 0 0 1-22-51.32c-1.47-20.7 4.88-39.75 17.88-53.62S303.38 144 323.67 144c20.14 0 38.37 7.62 51.33 21.46s19.47 33 18 53.51a84 84 0 0 1-22 51.3C357.86 284.28 341.06 292 323.67 292m-159.85 3.36c-29.76 0-55.93-27.51-58.33-61.33c-1.23-17.32 4.15-33.33 15.17-45.08s26.22-18 43.15-18s32.12 6.44 43.07 18.14s16.5 27.82 15.25 45c-2.44 33.77-28.6 61.27-58.31 61.27m256.55 59.92c-1.59-4.7-5.46-9.71-13.22-14.46c-23.46-14.33-52.32-21.91-83.48-21.91c-30.57 0-60.23 7.9-83.53 22.25c-26.25 16.17-43.89 39.75-51 68.18c-1.68 6.69-4.13 19.14-1.51 26.11a192.18 192.18 0 0 0 232.75-80.17Zm-256.74 46.09c7.07-28.21 22.12-51.73 45.47-70.75a8 8 0 0 0-2.59-13.77c-12-3.83-25.7-5.88-42.69-5.88c-23.82 0-49.11 6.45-68.14 18.17c-5.4 3.33-10.7 4.61-14.78 5.75a192.84 192.84 0 0 0 77.78 86.64l1.79-.14a103 103 0 0 1 3.16-20.02"
      }
    ]
  ],
  "videocam-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M374.79 308.78L457.5 367a16 16 0 0 0 22.5-14.62V159.62A16 16 0 0 0 457.5 145l-82.71 58.22A16 16 0 0 0 368 216.3v79.4a16 16 0 0 0 6.79 13.08"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M268 384H84a52.15 52.15 0 0 1-52-52V180a52.15 52.15 0 0 1 52-52h184.48A51.68 51.68 0 0 1 320 179.52V332a52.15 52.15 0 0 1-52 52Z"
      }
    ]
  ],
  "videocam-off-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M374.79 308.78L457.5 367a16 16 0 0 0 22.5-14.62V159.62A16 16 0 0 0 457.5 145l-82.71 58.22A16 16 0 0 0 368 216.3v79.4a16 16 0 0 0 6.79 13.08"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M50.19 140.57A51.94 51.94 0 0 0 32 180v152a52.15 52.15 0 0 0 52 52h184a51.6 51.6 0 0 0 22-4.9M208 128h60.48A51.68 51.68 0 0 1 320 179.52V248m96 168L80 80"
      }
    ]
  ],
  "volume-high-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M126 192H56a8 8 0 0 0-8 8v112a8 8 0 0 0 8 8h69.65a15.93 15.93 0 0 1 10.14 3.54l91.47 74.89A8 8 0 0 0 240 392V120a8 8 0 0 0-12.74-6.43l-91.47 74.89A15 15 0 0 1 126 192m194 128c9.74-19.38 16-40.84 16-64c0-23.48-6-44.42-16-64m48 176c19.48-33.92 32-64.06 32-112s-12-77.74-32-112m48 272c30-46 48-91.43 48-160s-18-113-48-160"
      }
    ]
  ],
  "volume-mute-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M416 432L64 80"
      }
    ],
    [
      "path",
      {
        "fill": "currentColor",
        "d": "M224 136.92v33.8a4 4 0 0 0 1.17 2.82l24 24a4 4 0 0 0 6.83-2.82v-74.15a24.53 24.53 0 0 0-12.67-21.72a23.91 23.91 0 0 0-25.55 1.83a8 8 0 0 0-.66.51l-31.94 26.15a4 4 0 0 0-.29 5.92l17.05 17.06a4 4 0 0 0 5.37.26Zm0 238.16l-78.07-63.92a32 32 0 0 0-20.28-7.16H64v-96h50.72a4 4 0 0 0 2.82-6.83l-24-24a4 4 0 0 0-2.82-1.17H56a24 24 0 0 0-24 24v112a24 24 0 0 0 24 24h69.76l91.36 74.8a8 8 0 0 0 .66.51a23.93 23.93 0 0 0 25.85 1.69A24.49 24.49 0 0 0 256 391.45v-50.17a4 4 0 0 0-1.17-2.82l-24-24a4 4 0 0 0-6.83 2.82ZM352 256c0-24.56-5.81-47.88-17.75-71.27a16 16 0 0 0-28.5 14.54C315.34 218.06 320 236.62 320 256q0 4-.31 8.13a8 8 0 0 0 2.32 6.25l19.66 19.67a4 4 0 0 0 6.75-2A147 147 0 0 0 352 256m64 0c0-51.19-13.08-83.89-34.18-120.06a16 16 0 0 0-27.64 16.12C373.07 184.44 384 211.83 384 256c0 23.83-3.29 42.88-9.37 60.65a8 8 0 0 0 1.9 8.26l16.77 16.76a4 4 0 0 0 6.52-1.27C410.09 315.88 416 289.91 416 256"
      }
    ],
    [
      "path",
      {
        "fill": "currentColor",
        "d": "M480 256c0-74.26-20.19-121.11-50.51-168.61a16 16 0 1 0-27 17.22C429.82 147.38 448 189.5 448 256c0 47.45-8.9 82.12-23.59 113a4 4 0 0 0 .77 4.55L443 391.39a4 4 0 0 0 6.4-1C470.88 348.22 480 307 480 256"
      }
    ]
  ],
  "close-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M368 368L144 144m224 0L144 368"
      }
    ]
  ],
  "flower-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M215.08 156.92c-4.89-24-10.77-56.27-10.77-73.23A51.36 51.36 0 0 1 256 32h0c28.55 0 51.69 23.69 51.69 51.69c0 16.5-5.85 48.95-10.77 73.23m-81.84 198.16c-4.91 24.06-10.77 56.16-10.77 73.23A51.36 51.36 0 0 0 256 480h0c28.55 0 51.69-23.69 51.69-51.69c0-16.54-5.85-48.93-10.77-73.23m58.16-140c24.06-4.91 56.16-10.77 73.23-10.77A51.36 51.36 0 0 1 480 256h0c0 28.55-23.69 51.69-51.69 51.69c-16.5 0-48.95-5.85-73.23-10.77m-198.16-81.85c-24-4.89-56.25-10.76-73.23-10.76A51.36 51.36 0 0 0 32 256h0c0 28.55 23.69 51.69 51.69 51.69c16.5 0 48.95-5.85 73.23-10.77"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M296.92 156.92c13.55-20.48 32.3-47.25 44.37-59.31a51.35 51.35 0 0 1 73.1 0h0c20.19 20.19 19.8 53.3 0 73.1c-11.66 11.67-38.67 30.67-59.31 44.37m-198.16 81.84c-20.48 13.55-47.25 32.3-59.31 44.37a51.35 51.35 0 0 0 0 73.1h0c20.19 20.19 53.3 19.8 73.1 0c11.67-11.66 30.67-38.67 44.37-59.31m140-58.16c20.48 13.55 47.25 32.3 59.31 44.37a51.35 51.35 0 0 1 0 73.1h0c-20.19 20.19-53.3 19.8-73.1 0c-11.69-11.69-30.66-38.65-44.37-59.31m-81.84-198.16c-13.53-20.43-32.38-47.32-44.37-59.31a51.35 51.35 0 0 0-73.1 0h0c-20.19 20.19-19.8 53.3 0 73.1c11.61 11.61 38.7 30.68 59.31 44.37"
      }
    ],
    [
      "circle",
      {
        "cx": "256",
        "cy": "256",
        "r": "64",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeMiterlimit": "10",
        "strokeWidth": "32"
      }
    ]
  ],
  "sunny-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M256 48v48m0 320v48m147.08-355.08l-33.94 33.94M142.86 369.14l-33.94 33.94M464 256h-48m-320 0H48m355.08 147.08l-33.94-33.94M142.86 142.86l-33.94-33.94"
      }
    ],
    [
      "circle",
      {
        "cx": "256",
        "cy": "256",
        "r": "80",
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeMiterlimit": "10",
        "strokeWidth": "32"
      }
    ]
  ],
  "rainy-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M114.61 162.85A16.07 16.07 0 0 0 128 149.6C140.09 76.17 193.63 32 256 32c57.93 0 96.62 37.75 112.2 77.74a15.84 15.84 0 0 0 12.2 9.87c50 8.15 91.6 41.54 91.6 99.59c0 59.4-48.6 100.8-108 100.8H130c-49.5 0-90-24.7-90-79.2c0-48.47 38.67-72.22 74.61-77.95Z"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "m144 384l-32 48m112-48l-64 96m144-96l-32 48m112-48l-64 96"
      }
    ]
  ],
  "prism-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M229.73 45.88L37.53 327.79a31.79 31.79 0 0 0 11.31 46L241 476.26a31.77 31.77 0 0 0 29.92 0l192.2-102.51a31.79 31.79 0 0 0 11.31-46L282.27 45.88a31.8 31.8 0 0 0-52.54 0M256 32v448"
      }
    ]
  ],
  "water-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeMiterlimit": "10",
        "strokeWidth": "32",
        "d": "M400 320c0 88.37-55.63 144-144 144s-144-55.63-144-144c0-94.83 103.23-222.85 134.89-259.88a12 12 0 0 1 18.23 0C296.77 97.15 400 225.17 400 320Z"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M344 328a72 72 0 0 1-72 72"
      }
    ]
  ],
  "rose-outline": [
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M416 128c-18.9 4.25-36.8 8.94-53.7 13.95c-40.5 12-75.5 27.15-105.4 41.65c-19.3 9.37-26.2 13.51-51.5 28.23c-58.4 33.69-93.4 77.4-93.4 142.81C112 428.55 167.6 480 256 480s144-55.81 144-129.72S339 225.24 416 128"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M264 180.19c-19.69-27-38.2-38.69-52.7-46.59C162.6 107.1 96 96 96 96c41.5 43.7 37.2 90.1 32 128c0 0-3.87 32.88 1.91 58.41"
      }
    ],
    [
      "path",
      {
        "fill": "none",
        "stroke": "currentColor",
        "strokeLinecap": "round",
        "strokeLinejoin": "round",
        "strokeWidth": "32",
        "d": "M372 139.15C356.55 102.6 336 64 336 64s-63.32 0-135.69 64m53.17-40.43C221.25 45.81 176 32 176 32c-15.3 20.8-28.79 51.58-34.87 74.17"
      }
    ]
  ]
};

export const ArrowDown = /*#__PURE__*/ createIonIcon("arrow-down-outline", ION_NODES["arrow-down-outline"], null);
export const ArrowLeft = /*#__PURE__*/ createIonIcon("arrow-back-outline", ION_NODES["arrow-back-outline"], null);
export const ArrowLeftRight = /*#__PURE__*/ createIonIcon("swap-horizontal-outline", ION_NODES["swap-horizontal-outline"], null);
export const ArrowRight = /*#__PURE__*/ createIonIcon("arrow-forward-outline", ION_NODES["arrow-forward-outline"], null);
export const ArrowUp = /*#__PURE__*/ createIonIcon("arrow-up-outline", ION_NODES["arrow-up-outline"], null);
export const AtSign = /*#__PURE__*/ createIonIcon("at-outline", ION_NODES["at-outline"], null);
export const Ban = /*#__PURE__*/ createIonIcon("ban-outline", ION_NODES["ban-outline"], null);
export const BarChart2 = /*#__PURE__*/ createIonIcon("stats-chart-outline", ION_NODES["stats-chart-outline"], null);
export const Bell = /*#__PURE__*/ createIonIcon("notifications-outline", ION_NODES["notifications-outline"], ION_NODES["notifications"]);
export const BellOff = /*#__PURE__*/ createIonIcon("notifications-off-outline", ION_NODES["notifications-off-outline"], null);
export const BookOpen = /*#__PURE__*/ createIonIcon("book-outline", ION_NODES["book-outline"], null);
export const Bookmark = /*#__PURE__*/ createIonIcon("bookmark-outline", ION_NODES["bookmark-outline"], ION_NODES["bookmark"]);
export const Briefcase = /*#__PURE__*/ createIonIcon("briefcase-outline", ION_NODES["briefcase-outline"], null);
export const Cake = /*#__PURE__*/ createIonIcon("gift-outline", ION_NODES["gift-outline"], null);
export const Calendar = /*#__PURE__*/ createIonIcon("calendar-outline", ION_NODES["calendar-outline"], null);
export const Camera = /*#__PURE__*/ createIonIcon("camera-outline", ION_NODES["camera-outline"], null);
export const Check = /*#__PURE__*/ createIonIcon("checkmark-outline", ION_NODES["checkmark-outline"], null);
export const CheckCheck = /*#__PURE__*/ createIonIcon("checkmark-done-outline", ION_NODES["checkmark-done-outline"], null);
export const CheckCircle2 = /*#__PURE__*/ createIonIcon("checkmark-circle-outline", ION_NODES["checkmark-circle-outline"], ION_NODES["checkmark-circle"]);
export const ChevronDown = /*#__PURE__*/ createIonIcon("chevron-down-outline", ION_NODES["chevron-down-outline"], null);
export const ChevronLeft = /*#__PURE__*/ createIonIcon("chevron-back-outline", ION_NODES["chevron-back-outline"], null);
export const ChevronRight = /*#__PURE__*/ createIonIcon("chevron-forward-outline", ION_NODES["chevron-forward-outline"], null);
export const ChevronUp = /*#__PURE__*/ createIonIcon("chevron-up-outline", ION_NODES["chevron-up-outline"], null);
export const Compass = /*#__PURE__*/ createIonIcon("compass-outline", ION_NODES["compass-outline"], null);
export const Copy = /*#__PURE__*/ createIonIcon("copy-outline", ION_NODES["copy-outline"], null);
export const CornerUpRight = /*#__PURE__*/ createIonIcon("return-up-forward-outline", ION_NODES["return-up-forward-outline"], null);
export const Crown = /*#__PURE__*/ createIonIcon("trophy-outline", ION_NODES["trophy-outline"], null);
export const Delete = /*#__PURE__*/ createIonIcon("backspace-outline", ION_NODES["backspace-outline"], null);
export const Download = /*#__PURE__*/ createIonIcon("download-outline", ION_NODES["download-outline"], null);
export const Eraser = /*#__PURE__*/ createIonIcon("bandage-outline", ION_NODES["bandage-outline"], null);
export const ExternalLink = /*#__PURE__*/ createIonIcon("open-outline", ION_NODES["open-outline"], null);
export const Eye = /*#__PURE__*/ createIonIcon("eye-outline", ION_NODES["eye-outline"], null);
export const EyeOff = /*#__PURE__*/ createIonIcon("eye-off-outline", ION_NODES["eye-off-outline"], null);
export const Feather = /*#__PURE__*/ createIonIcon("create-outline", ION_NODES["create-outline"], null);
export const File = /*#__PURE__*/ createIonIcon("document-outline", ION_NODES["document-outline"], null);
export const FileText = /*#__PURE__*/ createIonIcon("document-text-outline", ION_NODES["document-text-outline"], null);
export const Film = /*#__PURE__*/ createIonIcon("film-outline", ION_NODES["film-outline"], null);
export const Flag = /*#__PURE__*/ createIonIcon("flag-outline", ION_NODES["flag-outline"], null);
export const Globe = /*#__PURE__*/ createIonIcon("globe-outline", ION_NODES["globe-outline"], null);
export const GraduationCap = /*#__PURE__*/ createIonIcon("school-outline", ION_NODES["school-outline"], null);
export const Hash = /*#__PURE__*/ createIonIcon("pound", ION_NODES["pound"], null);
export const Heart = /*#__PURE__*/ createIonIcon("heart-outline", ION_NODES["heart-outline"], ION_NODES["heart"]);
export const Highlighter = /*#__PURE__*/ createIonIcon("color-wand-outline", ION_NODES["color-wand-outline"], null);
export const Image = /*#__PURE__*/ createIonIcon("image-outline", ION_NODES["image-outline"], null);
export const Info = /*#__PURE__*/ createIonIcon("information-circle-outline", ION_NODES["information-circle-outline"], null);
export const KeyRound = /*#__PURE__*/ createIonIcon("key-outline", ION_NODES["key-outline"], null);
export const Languages = /*#__PURE__*/ createIonIcon("language-outline", ION_NODES["language-outline"], null);
export const LayoutGrid = /*#__PURE__*/ createIonIcon("grid-outline", ION_NODES["grid-outline"], null);
export const Link = /*#__PURE__*/ createIonIcon("link-outline", ION_NODES["link-outline"], null);
export const Link2 = /*#__PURE__*/ createIonIcon("link-outline", ION_NODES["link-outline"], null);
export const Loader2 = /*#__PURE__*/ createIonIcon("load-c", ION_NODES["load-c"], null);
export const LocateFixed = /*#__PURE__*/ createIonIcon("locate-outline", ION_NODES["locate-outline"], null);
export const Lock = /*#__PURE__*/ createIonIcon("lock-closed-outline", ION_NODES["lock-closed-outline"], null);
export const LockKeyhole = /*#__PURE__*/ createIonIcon("lock-closed-outline", ION_NODES["lock-closed-outline"], null);
export const LogOut = /*#__PURE__*/ createIonIcon("log-out-outline", ION_NODES["log-out-outline"], null);
export const Mail = /*#__PURE__*/ createIonIcon("mail-outline", ION_NODES["mail-outline"], null);
export const MailCheck = /*#__PURE__*/ createIonIcon("mail-open-outline", ION_NODES["mail-open-outline"], null);
export const MapPin = /*#__PURE__*/ createIonIcon("location-outline", ION_NODES["location-outline"], null);
export const Menu = /*#__PURE__*/ createIonIcon("menu-outline", ION_NODES["menu-outline"], null);
export const MessageCircle = /*#__PURE__*/ createIonIcon("chatbubble-outline", ION_NODES["chatbubble-outline"], null);
export const MessageSquare = /*#__PURE__*/ createIonIcon("chatbox-outline", ION_NODES["chatbox-outline"], null);
export const Mic = /*#__PURE__*/ createIonIcon("mic-outline", ION_NODES["mic-outline"], null);
export const MicOff = /*#__PURE__*/ createIonIcon("mic-off-outline", ION_NODES["mic-off-outline"], null);
export const Minus = /*#__PURE__*/ createIonIcon("remove-outline", ION_NODES["remove-outline"], null);
export const Monitor = /*#__PURE__*/ createIonIcon("desktop-outline", ION_NODES["desktop-outline"], null);
export const MoreHorizontal = /*#__PURE__*/ createIonIcon("ellipsis-horizontal", ION_NODES["ellipsis-horizontal"], null);
export const MoreVertical = /*#__PURE__*/ createIonIcon("ellipsis-vertical", ION_NODES["ellipsis-vertical"], null);
export const Music = /*#__PURE__*/ createIonIcon("musical-notes-outline", ION_NODES["musical-notes-outline"], null);
export const Newspaper = /*#__PURE__*/ createIonIcon("newspaper-outline", ION_NODES["newspaper-outline"], null);
export const Pause = /*#__PURE__*/ createIonIcon("pause-outline", ION_NODES["pause-outline"], ION_NODES["pause"]);
export const PenTool = /*#__PURE__*/ createIonIcon("brush-outline", ION_NODES["brush-outline"], null);
export const Pencil = /*#__PURE__*/ createIonIcon("pencil-outline", ION_NODES["pencil-outline"], null);
export const Phone = /*#__PURE__*/ createIonIcon("call-outline", ION_NODES["call-outline"], null);
export const PhoneCall = /*#__PURE__*/ createIonIcon("call-outline", ION_NODES["call-outline"], null);
export const PhoneOff = /*#__PURE__*/ createIonIcon("call-sharp", ION_NODES["call-sharp"], null);
export const Pin = /*#__PURE__*/ createIonIcon("pin-outline", ION_NODES["pin-outline"], null);
export const PinOff = /*#__PURE__*/ createIonIcon("pin-sharp", ION_NODES["pin-sharp"], null);
export const Play = /*#__PURE__*/ createIonIcon("play-outline", ION_NODES["play-outline"], ION_NODES["play"]);
export const Plus = /*#__PURE__*/ createIonIcon("add-outline", ION_NODES["add-outline"], null);
export const QrCode = /*#__PURE__*/ createIonIcon("qr-code-outline", ION_NODES["qr-code-outline"], null);
export const Radio = /*#__PURE__*/ createIonIcon("radio-outline", ION_NODES["radio-outline"], null);
export const RefreshCw = /*#__PURE__*/ createIonIcon("refresh-outline", ION_NODES["refresh-outline"], null);
export const Repeat = /*#__PURE__*/ createIonIcon("repeat-outline", ION_NODES["repeat-outline"], null);
export const RotateCcw = /*#__PURE__*/ createIonIcon("reload-outline", ION_NODES["reload-outline"], null);
export const Save = /*#__PURE__*/ createIonIcon("save-outline", ION_NODES["save-outline"], null);
export const ScanFace = /*#__PURE__*/ createIonIcon("scan-circle-outline", ION_NODES["scan-circle-outline"], null);
export const ScanLine = /*#__PURE__*/ createIonIcon("scan-outline", ION_NODES["scan-outline"], null);
export const Search = /*#__PURE__*/ createIonIcon("search-outline", ION_NODES["search-outline"], null);
export const Send = /*#__PURE__*/ createIonIcon("paper-plane-outline", ION_NODES["paper-plane-outline"], null);
export const Settings = /*#__PURE__*/ createIonIcon("settings-outline", ION_NODES["settings-outline"], null);
export const Share = /*#__PURE__*/ createIonIcon("share-outline", ION_NODES["share-outline"], null);
export const Share2 = /*#__PURE__*/ createIonIcon("share-social-outline", ION_NODES["share-social-outline"], null);
export const Shield = /*#__PURE__*/ createIonIcon("shield-outline", ION_NODES["shield-outline"], null);
export const ShieldAlert = /*#__PURE__*/ createIonIcon("shield-half-outline", ION_NODES["shield-half-outline"], null);
export const ShieldCheck = /*#__PURE__*/ createIonIcon("shield-checkmark-outline", ION_NODES["shield-checkmark-outline"], null);
export const Smile = /*#__PURE__*/ createIonIcon("happy-outline", ION_NODES["happy-outline"], null);
export const Sparkles = /*#__PURE__*/ createIonIcon("sparkles-outline", ION_NODES["sparkles-outline"], null);
export const SquarePen = /*#__PURE__*/ createIonIcon("create-outline", ION_NODES["create-outline"], null);
export const Trash2 = /*#__PURE__*/ createIonIcon("trash-outline", ION_NODES["trash-outline"], null);
export const Trees = /*#__PURE__*/ createIonIcon("leaf-outline", ION_NODES["leaf-outline"], null);
export const Undo2 = /*#__PURE__*/ createIonIcon("arrow-undo-outline", ION_NODES["arrow-undo-outline"], null);
export const Upload = /*#__PURE__*/ createIonIcon("cloud-upload-outline", ION_NODES["cloud-upload-outline"], null);
export const UploadCloud = /*#__PURE__*/ createIonIcon("cloud-upload-outline", ION_NODES["cloud-upload-outline"], null);
export const User = /*#__PURE__*/ createIonIcon("person-outline", ION_NODES["person-outline"], null);
export const UserCheck = /*#__PURE__*/ createIonIcon("person-circle-outline", ION_NODES["person-circle-outline"], null);
export const UserMinus = /*#__PURE__*/ createIonIcon("person-remove-outline", ION_NODES["person-remove-outline"], null);
export const UserPlus = /*#__PURE__*/ createIonIcon("person-add-outline", ION_NODES["person-add-outline"], null);
export const UserRound = /*#__PURE__*/ createIonIcon("person-circle-outline", ION_NODES["person-circle-outline"], null);
export const UserX = /*#__PURE__*/ createIonIcon("person-remove-outline", ION_NODES["person-remove-outline"], null);
export const Users = /*#__PURE__*/ createIonIcon("people-outline", ION_NODES["people-outline"], null);
export const UsersRound = /*#__PURE__*/ createIonIcon("people-circle-outline", ION_NODES["people-circle-outline"], null);
export const Video = /*#__PURE__*/ createIonIcon("videocam-outline", ION_NODES["videocam-outline"], null);
export const VideoOff = /*#__PURE__*/ createIonIcon("videocam-off-outline", ION_NODES["videocam-off-outline"], null);
export const Volume2 = /*#__PURE__*/ createIonIcon("volume-high-outline", ION_NODES["volume-high-outline"], null);
export const VolumeX = /*#__PURE__*/ createIonIcon("volume-mute-outline", ION_NODES["volume-mute-outline"], null);
export const X = /*#__PURE__*/ createIonIcon("close-outline", ION_NODES["close-outline"], null);
export const SpringIcon = /*#__PURE__*/ createIonIcon("flower-outline", ION_NODES["flower-outline"], null, 15);
export const SummerIcon = /*#__PURE__*/ createIonIcon("sunny-outline", ION_NODES["sunny-outline"], null, 15);
export const AutumnIcon = /*#__PURE__*/ createIonIcon("rainy-outline", ION_NODES["rainy-outline"], null, 15);
export const ShareIcon = /*#__PURE__*/ createIonIcon("share-outline", ION_NODES["share-outline"], null, 17);
export const OakIcon = /*#__PURE__*/ createIonIcon("leaf-outline", ION_NODES["leaf-outline"], null, 15);
export const PineIcon = /*#__PURE__*/ createIonIcon("prism-outline", ION_NODES["prism-outline"], null, 15);
export const WillowIcon = /*#__PURE__*/ createIonIcon("water-outline", ION_NODES["water-outline"], null, 15);
export const BirchIcon = /*#__PURE__*/ createIonIcon("rose-outline", ION_NODES["rose-outline"], null, 15);
