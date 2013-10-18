var noflo = require('/noflo-noflo');

exports.runGraph = function (graph, callback) {
  graph.baseDir = 'the-behavior';
  noflo.createNetwork(graph, callback);
};

exports.prepareGraph = function (instance) {
  var graph = new noflo.Graph('the-behaviors');
  var behaviors = Array.prototype.slice.call(instance.getElementsByTagName('the-behavior'));

  // We use a single listener for all behaviors
  prevNode = exports.prepareListener(graph, instance);

  var componentLoader = require('/noflo-noflo/src/lib/ComponentLoader');
  var loader = new componentLoader.ComponentLoader('the-behavior');
  loader.listComponents(function () {});

  // Control detection with a gate. When any behavior has been recognized we stop
  // detection
  graph.addNode('Detect', 'flow/Gate');
  graph.addNode('AllowDetect', 'core/Merge');
  graph.addEdge('AllowDetect', 'out', 'Detect', 'open');
  graph.addNode('StopDetect', 'core/Merge');
  graph.addEdge('StopDetect', 'out', 'Detect', 'close');
  graph.addNode('SplitGesture', 'core/Split');
  graph.addEdge('Listen', 'out', 'SplitGesture', 'in');
  graph.addEdge('SplitGesture', 'out', 'Detect', 'in');
  // when that gesture ends we reopen it
  graph.addNode('AfterGestureReallowDetect', 'core/Kick');
  graph.addEdge('SplitGesture', 'out', 'AfterGestureReallowDetect', 'in');
  graph.addEdge('AfterGestureReallowDetect', 'out', 'AllowDetect', 'in');

  // Initially detection is enabled
  graph.addInitial(true, 'AllowDetect', 'in');

  // Connect listener to detection

  prevNode = ['Detect', 'out'];
  behaviors.forEach(function (behavior, idx) {
    // Build a subgraph for the behavior
    var id = behavior.type.charAt(0).toUpperCase() + behavior.type.slice(1) + idx;
    behavior.container = instance.container;
    var subgraph = exports.prepareDetectionGraph(behavior);
    //console.log(subgraph.toDOT());
    subgraph.baseDir = 'the-behavior';
    loader.loadGraph(id, subgraph, function (instance) {
      var graphNode = graph.addNode(id, instance);

      // Connect it with our listener
      graph.addEdge(prevNode[0], prevNode[1], id, 'detect');
      graph.addEdge('SplitGesture', 'out', id, 'in');

      // If the behavior passes we can stop detection
      graph.addEdge(id, 'pass', 'StopDetect', 'in');
    });

    // If this behavior fails, try next one
    prevNode = [id, 'fail'];
  });

  // If all detection failed, close detection
  graph.addEdge(prevNode[0], prevNode[1], 'StopDetect', 'in');

  return graph;
}

exports.prepareDetectionGraph = function (instance) {
  var prevNode;

  // Initialize subgraph
  var graph = new noflo.Graph(instance.type);

  // Entry point
  graph.addNode('Gesture', 'core/Repeat');
  graph.addExport('gesture.in', 'detect');
  graph.addNode('SplitGesture', 'core/Split');
  graph.addExport('splitgesture.in', 'in');
  prevNode = ['Gesture', 'out'];

  graph.addNode('Passed', 'core/Merge');
  graph.addNode('Target', 'core/Repeat');
  graph.addNode('AllowDetect', 'core/Repeat');

  // Go to action
  graph.addNode('DoAction', 'core/Merge');

  // When no gesture has been recognized we ignore the situation
  graph.addNode('NotYet', 'core/Drop');

  // Handle pass-thru
  exports.preparePassThrough(graph, instance);

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
  graph.addEdge('SplitPassed', 'out', 'PassThru', 'open');
  graph.addEdge('SplitGesture', 'out', 'AllowEnd', 'in');
  graph.addEdge('AllowEnd', 'out', 'AfterGestureCall', 'in');
  graph.addNode('AfterGestureCloseCallback', 'core/Kick');
  graph.addEdge('SplitGesture', 'out', 'AfterGestureCloseCallback', 'in');
  graph.addEdge('AfterGestureCloseCallback', 'out', 'AllowEnd', 'close');

  return graph;
}

exports.prepareListener = function (graph, instance) {
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
  // Report failures upstread
  graph.addNode('Failed', 'core/Merge');
  graph.addExport('failed.out', 'fail');

  // We use a gate for passing things after recognition straight to action
  graph.addNode('PassThru', 'flow/Gate');
  graph.addEdge('SplitGesture', 'out', 'PassThru', 'in');
  graph.addEdge('PassThru', 'out', 'DoAction', 'in');

  // Open on detected gesture
  graph.addEdge('SplitPassed', 'out', 'PassThru', 'open');

  // Close the gate after detection
  graph.addNode('SplitPassed', 'core/Split');
  graph.addEdge('Passed', 'out', 'SplitPassed', 'in');
  graph.addEdge('SplitPassed', 'out', 'DoAction', 'in');

  // Report passes upstream
  graph.addExport('splitpassed.out', 'pass');
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

exports.prepareDrag = function (graph, instance, prevNode) {
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
