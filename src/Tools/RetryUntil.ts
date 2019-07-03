/**
 * 重试几次后抛出异常
 * @param func 重试方法
 * @param interval 每次重试的时间间隔
 * @param retry 最多重试几次
 */
export async function retryUntil<T>(func: () => Promise<T>, interval: number, retry: number): Promise<T> {
    let index = 0;

    while (true) {
        try {
            return await func();
        } catch (error) {
            if (++index > retry)
                throw error;
            else
                await new Promise(resolve => setTimeout(resolve, interval));
        }
    }
}