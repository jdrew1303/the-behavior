var noflo = require('/noflo-noflo');

exports.runGraph = function (graph, callback) {
  graph.baseDir = 'the-behavior';
  noflo.createNetwork(graph, callback);
};

exports.prepareGraph = function (instance) {
  var prevNode;

  // Initialize graph
  var graph = new noflo.Graph('Drag');
  graph.addNode('NotYet', 'core/Drop');
  //graph.addNode('Failed', 'core/Output');
  graph.addNode('Passed', 'core/Merge');
  graph.addNode('Detect', 'flow/Gate');
  graph.addNode('Target', 'core/Repeat');
  graph.addNode('AllowDetect', 'core/Merge');
  graph.addEdge('AllowDetect', 'out', 'Detect', 'open');
  graph.addNode('StopDetect', 'core/Merge');
  graph.addEdge('StopDetect', 'out', 'Detect', 'close');
  // Initially detection is enabled
  graph.addInitial(true, 'AllowDetect', 'in');

  // Go to action
  graph.addNode('DoAction', 'core/Merge');

  // Listen to gestures
  prevNode = exports.prepareGesture(graph, instance);

  // Handle pass-thru
  prevNode = exports.preparePassThrough(graph, instance, prevNode);

  // Validate target node
  prevNode = exports.prepareAccept(graph, instance, prevNode);
  // Check the gesture
  switch (instance.type) {
    case 'pinch':
      prevNode = exports.preparePinch(graph, instance, prevNode);
      break;
    case 'drag':
      prevNode = exports.prepareDrag(graph, instance, prevNode);
      break;
    case 'swipe':
      prevNode = exports.prepareSwipe(graph, instance, prevNode);
      break;
  }
  // Check gesture direction
  prevNode = exports.prepareDirection(graph, instance, prevNode);

  // Gesture has been accepted, pass data to action
  graph.addEdge(prevNode[0], prevNode[1], 'Passed', 'in');
  prevNode = ['DoAction', 'out'];

  // Handle action
  switch (instance.action) {
    case 'move':
      exports.prepareMove(graph, instance, prevNode);
      break;
    case 'remove':
      exports.prepareRemove(graph, instance, prevNode);
      break;
    case 'attribute':
      exports.prepareAttribute(graph, instance, prevNode);
      break;
    default:
      // No built-in action, trigger event
      exports.prepareCallback(graph, instance, prevNode);
      break;
  }

  // Handle gesture end
  graph.addNode('AfterGestureReallowDetect', 'core/Kick');
  graph.addEdge('SplitGesture', 'out', 'AfterGestureReallowDetect', 'in');
  graph.addEdge('AfterGestureReallowDetect', 'out', 'AllowDetect', 'in');
  graph.addNode('AfterGestureClosePassthru', 'core/Kick');
  graph.addEdge('SplitGesture', 'out', 'AfterGestureClosePassthru', 'in');
  graph.addEdge('AfterGestureClosePassthru', 'out', 'PassThru', 'close');

  // Emit end event
  graph.addNode('EndCallback', 'core/Callback');
  graph.addNode('AfterGestureCall', 'core/Kick');
  graph.addEdge('SplitGesture', 'out', 'AfterGestureCall', 'data');
  graph.addEdge('AfterGestureCall', 'out', 'EndCallback', 'in');
  var endCallback = function (gesture) {
    instance.fire('gestureend', gesture);
  };
  graph.addInitial(endCallback, 'EndCallback', 'callback');
  // Only after a recognized resture
  graph.addNode('AllowEnd', 'flow/Gate');
  graph.addEdge('SplitPassed', 'out', 'AllowEnd', 'open');
  graph.addEdge('SplitGesture', 'out', 'AllowEnd', 'in');
  graph.addEdge('AllowEnd', 'out', 'AfterGestureCall', 'in');
  graph.addNode('AfterGestureCloseCallback', 'core/Kick');
  graph.addEdge('SplitGesture', 'out', 'AfterGestureCloseCallback', 'in');
  graph.addEdge('AfterGestureCloseCallback', 'out', 'AllowEnd', 'close');

  return graph;
}

exports.prepareGesture = function (graph, instance) {
  graph.addNode('Listen', 'gestures/GestureToObject');

  switch (instance.listento) {
    case 'document':
      graph.addInitial(document, 'Listen', 'element');
      break;
    case 'container':
    default:
      graph.addInitial(instance.container, 'Listen', 'element');
      break;
  }
  return ['Listen', 'out'];
};

exports.preparePassThrough = function (graph, instance, prevNode) {
  graph.addNode('SplitGesture', 'core/Split');
  graph.addEdge(prevNode[0], prevNode[1], 'SplitGesture', 'in');

  // We use a gate for stopping detection once the first one has happened
  graph.addEdge('SplitGesture', 'out', 'Detect', 'in');

  // Close the gate after detection
  graph.addNode('SplitPassed', 'core/Split');
  graph.addEdge('Passed', 'out', 'SplitPassed', 'in');
  graph.addEdge('SplitPassed', 'out', 'StopDetect', 'in');
  // Close it also on failure
  graph.addNode('Failed', 'core/Merge');
  graph.addEdge('Failed', 'out', 'StopDetect', 'in');

  // We use a gate for passing things after recognition straight to action
  graph.addNode('PassThru', 'flow/Gate');
  graph.addEdge('SplitGesture', 'out', 'PassThru', 'in');
  graph.addEdge('PassThru', 'out', 'DoAction', 'in');
  // Open on detected gesture
  graph.addEdge('SplitPassed', 'out', 'PassThru', 'open');

  return ['Detect', 'out'];
};

exports.prepareAccept = function (graph, instance, prevNode) {
  if (!instance.accept) {
    graph.addInitial(instance.container, 'Target', 'in');
    return prevNode;
  }

  graph.addNode('DetectTarget', 'gestures/DetectTarget');
  graph.addInitial('startelement', 'DetectTarget', 'key');
  graph.addEdge(prevNode[0], prevNode[1], 'DetectTarget', 'in');
  graph.addEdge('DetectTarget', 'target', 'Target', 'in');
  graph.addInitial(instance.accept, 'DetectTarget', 'target');
  graph.addEdge('DetectTarget', 'fail', 'Failed', 'in');
  return ['DetectTarget', 'pass'];
};

exports.preparePinch = function (graph, instance, prevNode) {
  graph.addNode('DetectPinch', 'gestures/DetectPinch');
  graph.addEdge(prevNode[0], prevNode[1], 'DetectPinch', 'in');
  graph.addEdge('DetectPinch', 'fail', 'Failed', 'in');
  return ['DetectPinch', 'pass'];
};

exports.ignoreOnPinch = function (graph, instance, prevNode) {
  graph.addNode('IgnoreOnPinch', 'gestures/DetectPinch');
  graph.addEdge(prevNode[0], prevNode[1], 'IgnoreOnPinch', 'in');
  graph.addEdge('IgnoreOnPinch', 'pass', 'Failed', 'in');
  return ['IgnoreOnPinch', 'fail'];
};

exports.prepareDrag = function (graph, instance, prevNode) {
  prevNode = exports.ignoreOnPinch(graph, instance, prevNode);

  var minDistance = 20;
  if (instance.mindistance) {
    minDistance = parseInt(instance.mindistance);
  }
  var maxSpeed = Infinity;
  if (instance.maxspeed) {
    maxSpeed = parseInt(instance.maxspeed);
  }
  graph.addNode('DetectDrag', 'gestures/DetectDrag');
  graph.addEdge(prevNode[0], prevNode[1], 'DetectDrag', 'in');
  graph.addInitial(minDistance, 'DetectDrag', 'distance');
  graph.addInitial(maxSpeed, 'DetectDrag', 'maxspeed');
  if (instance.type === 'drag') {
    graph.addEdge('DetectDrag', 'fail', 'NotYet', 'in');
  } else {
    graph.addEdge('DetectDrag', 'fail', 'Failed', 'in');
  }
  return ['DetectDrag', 'pass'];
};

exports.prepareSwipe = function (graph, instance, prevNode) {
  prevNode = exports.ignoreOnPinch(graph, instance, prevNode);

  var minDistance = 50;
  if (instance.mindistance) {
    minDistance = parseInt(instance.mindistance);
  }
  var minSpeed = 1.5;
  if (instance.minspeed) {
    minSpeed = parseFloat(instance.minspeed);
  }
  graph.addNode('DetectSwipe', 'gestures/DetectSwipe');
  graph.addEdge(prevNode[0], prevNode[1], 'DetectSwipe', 'in');
  graph.addInitial(minDistance, 'DetectSwipe', 'distance');
  graph.addInitial(minSpeed, 'DetectSwipe', 'speed');
  graph.addEdge('DetectSwipe', 'fail', 'Failed', 'in');
  return ['DetectSwipe', 'pass'];
};

exports.prepareDirection = function (graph, instance, prevNode) {
  if (!instance.direction) {
    return prevNode;
  }
  var directions = instance.direction.split(' ');
  if (directions.length === 4) {
    return prevNode;
  }
  var maxDistance = Infinity;
  if (instance.maxdistance) {
    maxDistance = parseInt(instance.maxdistance);
  }
  var cardinals = ['east', 'south', 'north', 'west'];
  graph.addNode('DetectDirection', 'gestures/DetectCardinalDirection');
  graph.addInitial(maxDistance, 'DetectDirection', 'maxdistance');
  graph.addEdge(prevNode[0], prevNode[1], 'DetectDirection', 'in');
  graph.addNode('DirectionPassed', 'core/Merge');
  cardinals.forEach(function (dir) {
    if (directions.indexOf(dir) !== -1) {
      // Allowed direction
      graph.addEdge('DetectDirection', dir, 'DirectionPassed', 'in');
      return;
    }
    graph.addEdge('DetectDirection', dir, 'Failed', 'in');
  });
  graph.addEdge('DetectDirection', 'fail', 'Failed', 'in');
  return ['DirectionPassed', 'out'];
};

exports.prepareMove = function (graph, instance, prevNode) {
  graph.addNode('EachTouch', 'objects/SplitObject');
  graph.addEdge('DoAction', 'out', 'EachTouch', 'in');
  graph.addNode('GetPoint', 'objects/GetObjectKey');
  graph.addEdge('EachTouch', 'out', 'GetPoint', 'in');
  graph.addInitial('movepoint', 'GetPoint', 'key');
  graph.addEdge('GetPoint', 'missed', 'NotYet', 'in');
  graph.addNode('Move', 'css/MoveElement');
  graph.addEdge('Target', 'out', 'Move', 'element');
  graph.addEdge('GetPoint', 'out', 'Move', 'point');
};

exports.prepareRemove = function (graph, instance, prevNode) {
  graph.addNode('SendNode', 'strings/SendString');
  graph.addEdge('Target', 'out', 'SendNode', 'string');
  graph.addEdge('DoAction', 'out', 'SendNode', 'in');
  graph.addNode('RemoveNode', 'dom/RemoveElement');
  graph.addEdge('SendNode', 'out', 'RemoveNode', 'element');
};

exports.prepareAttribute = function (graph, instance, prevNode) {
  graph.addNode('EachTouch', 'objects/SplitObject');
  graph.addEdge(prevNode[0], prevNode[1], 'EachTouch', 'in');
  graph.addNode('GetPoint', 'objects/GetObjectKey');
  graph.addEdge('EachTouch', 'out', 'GetPoint', 'in');
  graph.addInitial('movepoint', 'GetPoint', 'key');
  graph.addEdge('GetPoint', 'missed', 'Failed', 'in');
  graph.addNode('Set', 'dom/SetAttribute');
  graph.addEdge('Target', 'out', 'Set', 'element');
  graph.addInitial(instance.type, 'Set', 'attribute');
  graph.addEdge('GetPoint', 'out', 'Set', 'value');
};

exports.getCenter = function (graph, instance, prevNode) {
  // Calculate center
  graph.addNode('AddCenter', 'objects/SetPropertyValue');
  graph.addInitial('center', 'AddCenter', 'property');
  graph.addNode('SplitPinch', 'core/Split');
  graph.addEdge(prevNode[0], prevNode[1], 'SplitPinch', 'in');
  graph.addEdge('SplitPinch', 'out', 'AddCenter', 'in');
  graph.addNode('CalculateCenter', 'gestures/CalculateCenter');
  graph.addEdge('SplitPinch', 'out', 'CalculateCenter', 'in');
  graph.addEdge('CalculateCenter', 'center', 'AddCenter', 'value');
  return ['AddCenter', 'out'];
};

exports.getScale = function (graph, instance, prevNode) {
  // Calculate scale
  graph.addNode('SplitAfterAdd', 'core/Split');
  graph.addEdge(prevNode[0], prevNode[1], 'SplitAfterAdd', 'in');
  graph.addNode('AddScale', 'objects/SetPropertyValue');
  graph.addInitial('scale', 'AddScale', 'property');
  graph.addEdge('SplitAfterAdd', 'out', 'AddScale', 'in');
  graph.addNode('CalculateScale', 'gestures/CalculateScale');
  graph.addEdge('SplitAfterAdd', 'out', 'CalculateScale', 'in');
  graph.addEdge('CalculateScale', 'scale', 'AddScale', 'value');
  return ['AddScale', 'out'];
};
exports.prepareCallback = function (graph, instance, prevNode) {
  prevNode = exports.getCenter(graph, instance, prevNode);
  if (instance.type === 'pinch') {
    prevNode = exports.getScale(graph, instance, prevNode);
  }
  graph.addNode('Callback', 'core/Callback');
  graph.addEdge(prevNode[0], prevNode[1], 'Callback', 'in');
  var callback = function (gesture) {
    instance.fire('gesture', gesture);
  };
  graph.addInitial(callback, 'Callback', 'callback');
  graph.addNode('DropTarget', 'core/Drop');
  graph.addEdge('Target', 'out', 'DropTarget', 'in');
};
