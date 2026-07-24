#!/usr/bin/env swift

import AppKit
import CoreImage
import Foundation
import Vision

guard (3...4).contains(CommandLine.arguments.count) else {
  FileHandle.standardError.write(
    Data("Usage: extract-image-foreground.swift INPUT OUTPUT [INSTANCE_INDEX]\n".utf8)
  )
  exit(2)
}

let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])

guard let source = CIImage(contentsOf: inputURL, options: [.applyOrientationProperty: true]) else {
  FileHandle.standardError.write(Data("Unable to read input image.\n".utf8))
  exit(3)
}

let handler = VNImageRequestHandler(ciImage: source)
let request = VNGenerateForegroundInstanceMaskRequest()
try handler.perform([request])

guard let observation = request.results?.first, !observation.allInstances.isEmpty else {
  FileHandle.standardError.write(Data("No foreground instance was detected.\n".utf8))
  exit(4)
}

let instances = Array(observation.allInstances)
let selectedInstances: IndexSet
if CommandLine.arguments.count == 4 {
  guard
    let requestedIndex = Int(CommandLine.arguments[3]),
    instances.indices.contains(requestedIndex)
  else {
    FileHandle.standardError.write(
      Data("Instance index is out of range; detected \(instances.count) foreground instances.\n".utf8)
    )
    exit(5)
  }
  selectedInstances = IndexSet(integer: instances[requestedIndex])
} else {
  selectedInstances = observation.allInstances
}

let maskBuffer = try observation.generateScaledMaskForImage(
  forInstances: selectedInstances,
  from: handler
)
let mask = CIImage(cvPixelBuffer: maskBuffer)
let transparent = CIImage(color: .clear).cropped(to: source.extent)
let isolated = source.applyingFilter(
  "CIBlendWithMask",
  parameters: [
    kCIInputBackgroundImageKey: transparent,
    kCIInputMaskImageKey: mask,
  ]
)

let context = CIContext(options: [.useSoftwareRenderer: false])
let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
try context.writePNGRepresentation(
  of: isolated,
  to: outputURL,
  format: .RGBA8,
  colorSpace: colorSpace
)
print("Detected \(instances.count) foreground instances; wrote \(selectedInstances.count).")
