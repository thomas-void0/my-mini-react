//第二阶段 包含协调器的版本
let nextUnitOfWork = null;
let wipRoot = null;
let currentFiber = null;
let deletions = null;
//----------------------------scheduler 阶段----------------------------
function workLoop(deadline) {
  let shouldYield = false;
  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    shouldYield = deadline.timeRemaining() < 1;
  }

  if (!nextUnitOfWork && wipRoot) {
    commitRoot();
  }

  requestIdleCallback(workLoop);
}
//浏览器自动调度任务
requestIdleCallback(workLoop);

//----------------------------reconcile 阶段----------------------------
const isEvent = (key) => key.startsWith("on");
const isProperty = (key) => key !== "children" && !isEvent(key);
const isGone = (prev, next) => (key) => !(key in next);
const isNew = (prev, next) => (key) => prev[key] !== next[key];
const TEXT_ELEMENT = Symbol("TEXT_ELEMENT"); //文本类型
const UPDATE = Symbol("UPDATE"); //更新标识
const DELETE = Symbol("DELETE"); //删除标识
const PLACMENT = Symbol("PLACMENT"); //替换标识
//协调器，diff算法生效的位置
//对比新旧2棵fiber tree，找到不同的节点处理类型打上tag。在commit阶段统一的去处理
function reconcile(wipFiber) {
  const elements = wipFiber.props.children; //当前需要更新的列表
  let oldFiber = wipFiber.alternate && wipFiber.alternate.child; //对应的老节点
  let prevSibling = null;
  let newFiber = null;

  let index = 0;
  while (index < elements.length || oldFiber != null) {
    const element = elements[index];
    const sameType = oldFiber && element && element.type === oldFiber.type;
    //type没有改变，意味着标签名不变，打上更新标识
    if (sameType) {
      newFiber = {
        type: oldFiber.type,
        dom: oldFiber.dom,
        parent: wipFiber,
        alternate: oldFiber,
        props: element.props,
        effectTag: UPDATE,
      };
    }

    //替换标识
    if (element && !sameType) {
      newFiber = {
        type: element.type,
        dom: null,
        parent: wipFiber,
        alternate: null,
        props: element.props,
        effectTag: PLACMENT,
      };
    }

    //删除标识
    if (oldFiber && !sameType) {
      oldFiber.effectTag = DELETE;
      deletions.push(oldFiber);
    }

    //替换oldFiber为下一个兄弟节点
    if (oldFiber) {
      oldFiber = oldFiber.sibling;
    }

    //生成fiber树
    if (index === 0) {
      wipFiber.child = newFiber;
    } else if (element) {
      prevSibling.sibling = newFiber;
    }
    prevSibling = newFiber;
    index++;
  }
}
/**
 * 1，为jsx信息对象创建dom
 * 2，创建children的fiber
 * 3，返回下一个任务节点
 */
function performUnitOfWork(fiber) {
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }

  reconcile(fiber);

  if (fiber.child) {
    return fiber.child;
  }
  let nextFiber = fiber;
  while (nextFiber) {
    //如果有兄弟就找兄弟
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    //如果没有兄弟就找父元素的兄弟
    nextFiber = nextFiber.parent;
  }
}

//用于创建fiber对象的dom属性
function createDom(fiber) {
  const type = fiber.type;
  const dom =
    type === TEXT_ELEMENT
      ? document.createTextNode("")
      : document.createElement(type);

  // 添加属性
  updateDom(dom, {}, fiber.props);

  return dom;
}
//更新dom节点
function updateDom(dom, prevProps, nextProps) {
  //删除next中没有的属性
  Reflect.ownKeys(prevProps)
    .filter(isProperty)
    .filter(isGone(prevProps, nextProps))
    .forEach((name) => (dom[name] = ""));

  //添加新的属性
  Reflect.ownKeys(nextProps)
    .filter(isProperty)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => (dom[name] = nextProps[name]));

  //移除不需要的监听事件
  Reflect.ownKeys(prevProps)
    .filter(isEvent)
    .filter(
      (key) =>
        isGone(prevProps, nextProps)(key) || isNew(prevProps, nextProps)(key)
    )
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.removeEventListener(eventType, prevProps[name]);
    });

  //添加新的监听事件
  Reflect.ownKeys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.addEventListener(eventType, nextProps[name]);
    });
}
//----------------------------commit 阶段----------------------------
//挂载
function commitRoot() {
  deletions.forEach(commitWork);
  commitWork(wipRoot.child);
  currentFiber = wipRoot;
  wipRoot = null;
}
//递归挂载子dom
function commitWork(fiber) {
  if (!fiber) {
    return;
  }
  const parentDom = fiber.parent.dom;

  if (fiber.effectTag === UPDATE && fiber.dom) {
    updateDom(fiber.dom, fiber.alternate.props, fiber.props);
  } else if (fiber.effectTag === PLACMENT && fiber.dom) {
    parentDom.appendChild(fiber.dom);
  } else if (fiber.effectTag === DELETE) {
    parentDom.removeChild(fiber.dom);
  }
  commitWork(fiber.child);
  commitWork(fiber.sibling);
}
//----------------------------render 阶段----------------------------
//在render中设置根节点中的任务单元
function render(container, element) {
  wipRoot = {
    dom: container,
    props: {
      children: [element],
    },
    alternate: currentFiber,
  };
  deletions = [];
  nextUnitOfWork = wipRoot;
}

//根据jsx模版创建对象
function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      children: children.map((child) =>
        typeof child === "object" ? child : createTextElement(child)
      ),
    },
  };
}

//创建文本对象
function createTextElement(text) {
  return {
    type: TEXT_ELEMENT,
    props: {
      nodeValue: text,
      children: [],
    },
  };
}

//test
const container = document.getElementById("root");

const updateValue = (e) => {
  rerender(e.target.value);
};

const rerender = (value) => {
  const element = createElement(
    "div",
    null,
    createElement("input", {
      onInput: updateValue,
      value: value,
    }),
    createElement("h2", null, "Hello ", value)
  );
  render(container, element);
};

rerender("World");
