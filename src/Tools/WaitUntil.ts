/**
 * 根据传入的条件方法判断什么时候resolve
 * @param predict 条件方法，返回true时resolve，返回false在interval毫秒后重试
 * @param interval 每次重试的时间间隔
 * @param retry 最多重试几次
 * @param message 错误提示消息
 */
export async function waitUntil(predict: () => Promise<boolean>, interval: number, retry: number, message = '等待超时'): Promise<void> {
    let index = 0;

    while (index++ < retry) {
        await new Promise(resolve => setTimeout(resolve, interval));
        if (await predict()) return;
    }

    throw new Error(message);
}