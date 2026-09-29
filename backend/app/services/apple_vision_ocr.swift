import AppKit
import Foundation
import PDFKit
import Vision

struct OCRPage: Encodable {
    let page: Int
    let text: String
    let image_base64: String
}

struct OCRResult: Encodable {
    let pages: [OCRPage]
}

func jpegBase64(_ image: NSImage) throws -> String {
    let scale = min(1.0, 2400 / max(image.size.width, image.size.height))
    let normalized = NSImage(size: CGSize(width: image.size.width * scale, height: image.size.height * scale))
    normalized.lockFocus()
    image.draw(in: CGRect(origin: .zero, size: normalized.size), from: .zero, operation: .copy, fraction: 1)
    normalized.unlockFocus()
    var rect = CGRect(origin: .zero, size: normalized.size)
    guard let cgImage = normalized.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
        throw NSError(domain: "KaoyanOCR", code: 1, userInfo: [NSLocalizedDescriptionKey: "无法读取图片像素"])
    }
    let bitmap = NSBitmapImageRep(cgImage: cgImage)
    guard let data = bitmap.representation(using: .jpeg, properties: [.compressionFactor: 0.78]) else {
        throw NSError(domain: "KaoyanOCR", code: 2, userInfo: [NSLocalizedDescriptionKey: "无法转换图片格式"])
    }
    return data.base64EncodedString()
}

func recognize(_ image: NSImage) throws -> String {
    let scale = min(1.0, 2400 / max(image.size.width, image.size.height))
    let normalized = NSImage(size: CGSize(width: image.size.width * scale, height: image.size.height * scale))
    normalized.lockFocus()
    image.draw(in: CGRect(origin: .zero, size: normalized.size), from: .zero, operation: .copy, fraction: 1)
    normalized.unlockFocus()
    var rect = CGRect(origin: .zero, size: normalized.size)
    guard let cgImage = normalized.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
        throw NSError(domain: "KaoyanOCR", code: 3, userInfo: [NSLocalizedDescriptionKey: "无法读取图片像素"])
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ["zh-Hans", "en-US"]
    try VNImageRequestHandler(cgImage: cgImage).perform([request])
    return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
}

func main() throws {
    guard CommandLine.arguments.count == 3 else {
        throw NSError(domain: "KaoyanOCR", code: 4, userInfo: [NSLocalizedDescriptionKey: "参数错误"])
    }
    let path = CommandLine.arguments[1]
    let kind = CommandLine.arguments[2]
    var output: [OCRPage] = []

    if kind == "image" {
        guard let image = NSImage(contentsOfFile: path) else {
            throw NSError(domain: "KaoyanOCR", code: 5, userInfo: [NSLocalizedDescriptionKey: "图片无法打开"])
        }
        output.append(OCRPage(page: 1, text: try recognize(image), image_base64: try jpegBase64(image)))
    } else {
        guard let document = PDFDocument(url: URL(fileURLWithPath: path)) else {
            throw NSError(domain: "KaoyanOCR", code: 6, userInfo: [NSLocalizedDescriptionKey: "PDF 无法打开"])
        }
        if document.pageCount > 300 {
            throw NSError(domain: "KaoyanOCR", code: 7, userInfo: [NSLocalizedDescriptionKey: "PDF 页数不能超过 300 页"])
        }
        for index in 0..<document.pageCount {
            guard let page = document.page(at: index) else { continue }
            let nativeText = page.string?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if nativeText.count >= 30 { continue }
            if output.count >= 30 {
                throw NSError(domain: "KaoyanOCR", code: 8, userInfo: [NSLocalizedDescriptionKey: "单个 PDF 最多 OCR 30 页，请拆分后上传"])
            }
            let bounds = page.bounds(for: .mediaBox)
            let scale = min(2.2, 2400 / max(bounds.width, bounds.height))
            let image = page.thumbnail(of: CGSize(width: bounds.width * scale, height: bounds.height * scale), for: .mediaBox)
            output.append(OCRPage(page: index + 1, text: try recognize(image), image_base64: try jpegBase64(image)))
        }
    }
    let data = try JSONEncoder().encode(OCRResult(pages: output))
    FileHandle.standardOutput.write(data)
}

do {
    try main()
} catch {
    let message = ["error": error.localizedDescription]
    let data = try! JSONSerialization.data(withJSONObject: message)
    FileHandle.standardOutput.write(data)
    exit(2)
}
